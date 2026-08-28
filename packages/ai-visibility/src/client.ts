import {
  type AiVisibilityProvider,
  type AiVisibilityTarget,
  type PromptRunResult,
  type PromptSampleResult,
  type ProviderSample,
  type Sentiment,
  type TrackedPromptInput,
} from "./types";
import { isProviderConfigured, isAnyProviderConfigured } from "./llm-caller";
import { getProvider, type Citation } from "./providers";

export { isProviderConfigured, isAnyProviderConfigured as isAiVisibilityConfigured };

// A project with no explicit aiVisibilityTargets configured (Settings'
// target picker is opt-in) defaults to BrightData's real scraped surfaces
// only - the actual ChatGPT/Gemini/Perplexity/Copilot consumer UIs, plus
// Google AI Overview. A project can still opt into OpenRouter (e.g. for
// Claude, which has no scrapable consumer surface for BrightData to use)
// or the 4 direct-API providers in Settings -> Providers, but neither is
// on by default - explicit user decision: OpenRouter's real native web
// search plugin on a frontier model is genuinely expensive per call
// (confirmed live: ~$2 for one run's worth of samples), not something a
// project should be billed for without deliberately turning it on.
export function defaultTargets(): AiVisibilityTarget[] {
  return [
    { provider: "brightdata", model: "chatgpt", webSearch: true },
    { provider: "brightdata", model: "gemini", webSearch: true },
    { provider: "brightdata", model: "perplexity", webSearch: true },
    { provider: "brightdata", model: "copilot", webSearch: true },
    { provider: "brightdata", model: "google-ai-overview", webSearch: true },
  ];
}

// Parses a real LLM response for a mention of one entity (a brand or a
// tracked competitor, identified by domain, plus any real alternate names
// from projects.aiVisibilityAliases / projectCompetitors.aliases) - used for
// both the project's own brand and every tracked competitor, all from the
// same response text. `aliases` may be null/undefined/empty (older projects/
// competitors with no aliases saved) - always treated as [] in that case, so
// this stays a strict superset of the old domain-only matching.
function parseResponseForEntity(responseText: string, entityDomain: string, aliases?: string[] | null): PromptSampleResult {
  const entityName = entityDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split(".")[0]!
    .toLowerCase();

  // Every real string this entity could be recognized by: the domain-derived
  // name, the raw domain, and any saved alias - deduped, empties dropped.
  const needles = [...new Set([entityName, entityDomain.toLowerCase(), ...(aliases ?? []).map((a) => a.trim().toLowerCase())])].filter(
    (n) => n.length > 0,
  );

  const lower = responseText.toLowerCase();
  const mentioned = needles.some((n) => lower.includes(n));

  if (!mentioned) {
    return { mentioned: false, position: null, sentiment: null, responseSnippet: null };
  }

  // Very simple position estimation: count how many other brand-like mentions
  // appear before ours (brands are often listed as comma-separated items).
  const sentences = responseText.split(/[.\n]/);
  const mentionSentence = sentences.find((s) => {
    const sLower = s.toLowerCase();
    return needles.some((n) => sLower.includes(n));
  });
  const responseSnippet = mentionSentence?.trim().slice(0, 200) ?? null;

  // Sentiment: look for positive/negative keywords near the mention
  const posWords = ["best", "top", "excellent", "highly", "recommend", "great", "strong", "leading"];
  const negWords = ["expensive", "complex", "difficult", "limited", "poor", "worse", "issue", "problem"];
  const ctx = mentionSentence?.toLowerCase() ?? "";
  const pos = posWords.some((w) => ctx.includes(w));
  const neg = negWords.some((w) => ctx.includes(w));
  const sentiment: Sentiment = pos && !neg ? "positive" : neg ? "negative" : "neutral";

  // Rough position: count capitalized brand-like nouns before ours in the
  // response (matched against the original-case text, not the lowercased
  // copy used for the mention check above).
  const brandLikeMentions = [...responseText.matchAll(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g)];
  const position = Math.max(1, brandLikeMentions.findIndex((m) => needles.some((n) => m[0].toLowerCase().includes(n))) + 1);

  return { mentioned: true, position, sentiment, responseSnippet };
}

export interface EntityMentionResult extends PromptSampleResult {
  // null = the project's own brand; a domain = a tracked competitor.
  entityDomain: string | null;
}

export interface SampleEntitiesResult {
  target: AiVisibilityTarget;
  citations: Citation[];
  webQueries: string[];
  entities: EntityMentionResult[];
  // The full raw provider payload for this one real call, when the provider
  // captured one - null when the provider didn't/couldn't (best-effort, see
  // ScrapeResult.rawOutput). Callers persist this into
  // aiVisibilityResults.rawOutput.
  rawOutput: unknown;
}

// Per-entity real alternate names, keyed the same way `domains` is built
// below (brand first, then competitors in order) - projects.aiVisibilityAliases
// for the brand, projectCompetitors.aliases for each competitor. Optional and
// index-aligned with competitorDomains; a missing/short array just means
// "no aliases for that competitor," never an error.
export interface EntityAliases {
  brand?: string[] | null;
  competitors?: Array<string[] | null | undefined>;
}

const SAMPLING_INSTRUCTION =
  "You are a helpful assistant. Answer the user's question concisely, in plain prose. Mention specific brands or products by name where relevant, as you normally would.\n\n";

// Makes ONE real provider call (via the packages/ai-visibility/src/providers
// registry) and parses that single response for mentions of the brand AND
// every tracked competitor - Share of Voice comes from this at no extra
// LLM/scrape cost over brand-only sampling. Real-only: returns `null` (never
// a fabricated result) when the target's provider isn't configured or the
// real call fails, so a caller can skip persisting/rendering that attempt
// instead of storing made-up mention data.
export async function sampleEntities(
  promptText: string,
  brandDomain: string,
  competitorDomains: string[],
  target: AiVisibilityTarget,
  sampleIndex = 0,
  aliases?: EntityAliases,
): Promise<SampleEntitiesResult | null> {
  const domains = [brandDomain, ...competitorDomains];

  const impl = getProvider(target.provider);
  if (!impl || !impl.isConfigured()) return null;

  try {
    const result = await impl.run(target.model, SAMPLING_INSTRUCTION + promptText, {
      version: target.version,
      webSearch: target.webSearch,
    });
    return {
      target,
      citations: result.citations,
      webQueries: result.webQueries,
      entities: domains.map((entityDomain, i) => {
        const entityAliases = i === 0 ? aliases?.brand : aliases?.competitors?.[i - 1];
        return {
          entityDomain: i === 0 ? null : entityDomain,
          ...parseResponseForEntity(result.textContent, entityDomain, entityAliases),
        };
      }),
      // Best-effort: a provider that couldn't capture its raw payload
      // returns undefined on ScrapeResult.rawOutput - normalized to null
      // here so callers get a consistent "nothing captured" value instead of
      // undefined silently dropping the column on insert.
      rawOutput: result.rawOutput ?? null,
    };
  } catch (err) {
    console.error(`[ai-visibility] ${target.provider}/${target.model} real sample failed:`, err);
    return null;
  }
}

// Brand-only convenience wrapper around sampleEntities(), used by Brand
// Lookup (a one-off ad-hoc check with no tracked competitors involved).
// Real-only, same as sampleEntities() - null means "not configured or the
// real call failed," never a fabricated result.
export async function samplePrompt(
  promptText: string,
  brandDomain: string,
  provider: AiVisibilityProvider,
  sampleIndex = 0,
): Promise<PromptSampleResult | null> {
  const result = await sampleEntities(promptText, brandDomain, [], { provider, model: provider }, sampleIndex);
  if (!result) return null;
  const { entityDomain: _entityDomain, ...brandResult } = result.entities[0]!;
  return brandResult;
}

export interface DetailedProviderSample {
  target: AiVisibilityTarget;
  sampleIndex: number;
  citations: Citation[];
  webQueries: string[];
  entities: EntityMentionResult[];
  // The full raw provider payload for this one real call, or null when the
  // provider couldn't capture one - callers write this straight into
  // aiVisibilityResults.rawOutput.
  rawOutput: unknown;
}

export interface DetailedPromptRunResult {
  promptId: string;
  promptText: string;
  samples: DetailedProviderSample[];
}

// Runs every tracked prompt against every requested target,
// `samplesPerProvider` times each, checking the brand AND every tracked
// competitor per sample. This is the real primitive the run route persists
// aiVisibilityResults rows from. Real-only: any (target, sample) attempt
// that came back `null` (unconfigured or a failed real call) is skipped
// entirely, not padded with fabricated data - a prompt run against an
// unconfigured target simply contributes zero samples.
//
// Every (target, sample) attempt for a prompt runs concurrently (not one
// at a time) - scraped providers like BrightData are slow async jobs
// (trigger -> poll -> fetch, often 30s+ each), so serializing e.g. 6
// targets x 3 samples would mean waiting for the sum of every call instead
// of roughly the slowest one. These are independent real network calls
// with no ordering dependency, so there's no correctness reason to
// serialize them.
export async function runVisibilityCheckDetailed(params: {
  prompts: TrackedPromptInput[];
  brandDomain: string;
  competitorDomains?: string[];
  targets?: AiVisibilityTarget[];
  samplesPerProvider?: number;
  // Real alternate names for the brand (projects.aiVisibilityAliases) and,
  // index-aligned with competitorDomains, each tracked competitor
  // (projectCompetitors.aliases) - callers must select these columns
  // themselves and pass them through; omitted entirely falls back to
  // domain-only matching (parseResponseForEntity's prior behavior).
  aliases?: EntityAliases;
}): Promise<DetailedPromptRunResult[]> {
  const targets = params.targets && params.targets.length > 0 ? params.targets : defaultTargets();
  const samplesPerProvider = params.samplesPerProvider ?? 3;
  const competitorDomains = params.competitorDomains ?? [];

  return Promise.all(
    params.prompts.map(async (prompt) => {
      const attempts: Array<{ target: AiVisibilityTarget; sampleIndex: number }> = [];
      for (const target of targets) {
        for (let sampleIndex = 0; sampleIndex < samplesPerProvider; sampleIndex++) {
          attempts.push({ target, sampleIndex });
        }
      }

      const results = await Promise.all(
        attempts.map(({ target, sampleIndex }) =>
          sampleEntities(prompt.promptText, params.brandDomain, competitorDomains, target, sampleIndex, params.aliases).then(
            (result): DetailedProviderSample | null =>
              result
                ? {
                    target,
                    sampleIndex,
                    citations: result.citations,
                    webQueries: result.webQueries,
                    entities: result.entities,
                    rawOutput: result.rawOutput,
                  }
                : null,
          ),
        ),
      );

      const samples = results.filter((s): s is DetailedProviderSample => s !== null);
      return { promptId: prompt.id, promptText: prompt.promptText, samples };
    }),
  );
}

// Strips a detailed (brand + competitors) run result down to the brand-only
// shape the Visibility page's breakdown table renders - lets the run route
// reuse the one real detailed sampling pass for both persistence (full
// entity data) and its HTTP response (brand-only), no second sampling pass.
export function toBrandOnlyRunResult(detailed: DetailedPromptRunResult): PromptRunResult {
  return {
    promptId: detailed.promptId,
    promptText: detailed.promptText,
    samples: detailed.samples.map((s): ProviderSample => {
      const { entityDomain: _entityDomain, ...brandResult } = s.entities[0]!;
      return { provider: s.target.provider, model: s.target.model, sampleIndex: s.sampleIndex, result: brandResult };
    }),
  };
}

// Visibility % = share of samples (across every prompt/provider/sample)
// where the entity was mentioned at all. The PRD's headline metric for
// brand visibility; also reused for Share of Voice (per competitor) and the
// real visibility trend chart (per calendar day).
export function calculateVisibilityScore(samples: Array<{ mentioned: boolean }>): number {
  if (samples.length === 0) return 0;
  const mentionedCount = samples.filter((s) => s.mentioned).length;
  return Math.round((mentionedCount / samples.length) * 100);
}
