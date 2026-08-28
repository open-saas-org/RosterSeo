import { WEB_QUERIES_UNAVAILABLE } from "./providers";

// Real Query Fan-Out analysis: what actual web-search queries an AI engine
// issued while answering a tracked prompt, sourced from
// aiVisibilityResults.webQueries (only ever populated by scraped/web-search-
// enabled provider runs - BrightData, OpenRouter :online). A pure
// aggregation module that runs over plain JS rows instead of pre-aggregated
// SQL, and is called client-side (filters - model/tags/day-window - never
// re-fetch, matching this app's Visibility/Share of Voice dashboards).
//
// This replaces the previous Query Fan-Out feature, which just asked an LLM
// to guess related sub-queries (a single extra API call, no real search data
// behind it) - deliberately deleted per explicit user decision, not kept
// alongside this.

const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "in", "on", "and", "or", "is", "are", "was", "were", "be", "been",
  "with", "at", "by", "from", "as", "that", "this", "it", "its", "how", "what", "why", "when", "where",
  "who", "which", "do", "does", "did", "can", "will", "should", "would", "could", "vs", "your", "you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export interface FanoutInputRow {
  promptId: string;
  promptText: string;
  provider: string; // registry provider id, for a friendly model label (getModelDisplayLabel)
  model: string; // the AI surface (chatgpt/gemini/openrouter model slug/...) - the actual filter/group key
  date: string; // ISO yyyy-mm-dd, for the day-window filter
  webQueries: string[];
  // Whether the source aiVisibilityResults run (the same brand row this
  // webQueries array came from) actually mentioned the brand - lets each
  // FanoutQueryStat report what fraction of the runs that issued it landed a
  // real brand mention, not just how often the query recurred. Optional (not
  // every caller of computeFanoutAnalysis selects it yet) - missing/undefined
  // is treated as "not mentioned" for that row, same as `false`.
  mentioned?: boolean;
}

export interface FanoutQueryStat {
  query: string;
  runCount: number; // how many run instances issued this exact query
  promptCount: number; // how many distinct prompts this query showed up under
  byPrompt: Array<{ promptId: string; promptText: string; count: number }>;
  // % of runCount runs where the source run's brand row had mentioned: true.
  brandMentionRate: number;
}

export interface FanoutWordStat {
  word: string;
  count: number;
  isStopword: boolean;
}

export interface FanoutPerPromptStat {
  promptId: string;
  promptText: string;
  runs: number;
  fanoutRuns: number;
  totalQueryInstances: number; // sum of every real query occurrence for this prompt
  distinctQueryCount: number; // real, uncapped - independent of `queries`' display cap
  avgPerRun: number; // totalQueryInstances / fanoutRuns
  queries: FanoutQueryStat[];
}

export interface FanoutAnalysis {
  totalRuns: number;
  fanoutRuns: number; // runs that produced at least one real captured query
  unknownQueryRuns: number; // totalRuns - fanoutRuns
  totalQueries: number; // total real query instances (not deduped)
  avgFanOut: number; // totalQueries / fanoutRuns
  topByRuns: FanoutQueryStat[];
  topByPrompts: FanoutQueryStat[]; // ranked by breadth (distinct prompts reached)
  termCloud: FanoutWordStat[];
  wordChanges: { added: FanoutWordStat[]; dropped: FanoutWordStat[]; preserved: FanoutWordStat[] };
  perPrompt: FanoutPerPromptStat[];
}

const LIMITS = { topQueries: 25, terms: 60, perPromptTop: 10, breadth: 20 };

// Real queries only: drops the WEB_QUERIES_UNAVAILABLE sentinel and any
// query that's just the prompt echoed back verbatim (a real but useless
// signal - it says nothing about how the engine rewrote the prompt).
function realQueriesFor(row: FanoutInputRow): string[] {
  const promptNorm = row.promptText.trim().toLowerCase();
  return row.webQueries
    .map((q) => q.trim())
    .filter((q) => q && q !== WEB_QUERIES_UNAVAILABLE && q.toLowerCase() !== promptNorm);
}

type QueryEntry = { runCount: number; mentionedCount: number; byPrompt: Map<string, { promptText: string; count: number }> };

function toQueryStats(counts: Map<string, QueryEntry>, by: "runCount" | "promptCount", limit?: number): FanoutQueryStat[] {
  const stats = [...counts.entries()].map(([query, v]) => ({
    query,
    runCount: v.runCount,
    promptCount: v.byPrompt.size,
    byPrompt: [...v.byPrompt.entries()]
      .map(([promptId, p]) => ({ promptId, promptText: p.promptText, count: p.count }))
      .sort((a, b) => b.count - a.count),
    brandMentionRate: v.runCount > 0 ? Math.round((v.mentionedCount / v.runCount) * 100) : 0,
  }));
  stats.sort((a, b) => (by === "runCount" ? b.runCount - a.runCount : b.promptCount - a.promptCount));
  return limit ? stats.slice(0, limit) : stats;
}

export function computeFanoutAnalysis(rows: FanoutInputRow[], opts?: { uncapped?: boolean }): FanoutAnalysis {
  const cap = opts?.uncapped ? undefined : LIMITS.topQueries;
  const termCap = opts?.uncapped ? undefined : LIMITS.terms;

  const queryCounts = new Map<string, QueryEntry>();
  const termCounts = new Map<string, number>();
  const addedCounts = new Map<string, number>();
  const droppedCounts = new Map<string, number>();
  const preservedCounts = new Map<string, number>();
  const perPrompt = new Map<string, { promptText: string; runs: number; fanoutRuns: number; totalQueryInstances: number; counts: Map<string, QueryEntry> }>();

  let fanoutRuns = 0;
  let totalQueries = 0;

  for (const row of rows) {
    const prompt = perPrompt.get(row.promptId) ?? { promptText: row.promptText, runs: 0, fanoutRuns: 0, totalQueryInstances: 0, counts: new Map() };
    prompt.runs++;
    perPrompt.set(row.promptId, prompt);

    const queries = realQueriesFor(row);
    if (queries.length === 0) continue;

    fanoutRuns++;
    prompt.fanoutRuns++;
    prompt.totalQueryInstances += queries.length;
    totalQueries += queries.length;

    const promptTokens = new Set(tokenize(row.promptText));

    for (const query of queries) {
      const normalized = query.toLowerCase();

      const entry = queryCounts.get(normalized) ?? { runCount: 0, mentionedCount: 0, byPrompt: new Map() };
      entry.runCount++;
      if (row.mentioned) entry.mentionedCount++;
      const eByPrompt = entry.byPrompt.get(row.promptId) ?? { promptText: row.promptText, count: 0 };
      eByPrompt.count++;
      entry.byPrompt.set(row.promptId, eByPrompt);
      queryCounts.set(normalized, entry);

      const promptEntry = prompt.counts.get(normalized) ?? { runCount: 0, mentionedCount: 0, byPrompt: new Map() };
      promptEntry.runCount++;
      if (row.mentioned) promptEntry.mentionedCount++;
      const pByPrompt = promptEntry.byPrompt.get(row.promptId) ?? { promptText: row.promptText, count: 0 };
      pByPrompt.count++;
      promptEntry.byPrompt.set(row.promptId, pByPrompt);
      prompt.counts.set(normalized, promptEntry);

      const queryTokens = tokenize(query);
      for (const t of queryTokens) termCounts.set(t, (termCounts.get(t) ?? 0) + 1);

      const queryTokenSet = new Set(queryTokens);
      for (const t of promptTokens) {
        if (queryTokenSet.has(t)) preservedCounts.set(t, (preservedCounts.get(t) ?? 0) + 1);
        else droppedCounts.set(t, (droppedCounts.get(t) ?? 0) + 1);
      }
      for (const t of queryTokenSet) {
        if (!promptTokens.has(t)) addedCounts.set(t, (addedCounts.get(t) ?? 0) + 1);
      }
    }
  }

  const toWordStats = (m: Map<string, number>, limit?: number): FanoutWordStat[] => {
    const stats = [...m.entries()].map(([word, count]) => ({ word, count, isStopword: STOPWORDS.has(word) })).sort((a, b) => b.count - a.count);
    return limit ? stats.slice(0, limit) : stats;
  };

  return {
    totalRuns: rows.length,
    fanoutRuns,
    unknownQueryRuns: rows.length - fanoutRuns,
    totalQueries,
    avgFanOut: fanoutRuns > 0 ? Math.round((totalQueries / fanoutRuns) * 10) / 10 : 0,
    topByRuns: toQueryStats(queryCounts, "runCount", cap),
    topByPrompts: toQueryStats(queryCounts, "promptCount", opts?.uncapped ? undefined : LIMITS.breadth),
    termCloud: toWordStats(termCounts, termCap),
    wordChanges: {
      added: toWordStats(addedCounts, termCap),
      dropped: toWordStats(droppedCounts, termCap),
      preserved: toWordStats(preservedCounts, termCap),
    },
    perPrompt: [...perPrompt.entries()]
      .map(([promptId, v]) => ({
        promptId,
        promptText: v.promptText,
        runs: v.runs,
        fanoutRuns: v.fanoutRuns,
        totalQueryInstances: v.totalQueryInstances,
        distinctQueryCount: v.counts.size,
        avgPerRun: v.fanoutRuns > 0 ? Math.round((v.totalQueryInstances / v.fanoutRuns) * 10) / 10 : 0,
        queries: toQueryStats(v.counts, "runCount", opts?.uncapped ? undefined : LIMITS.perPromptTop),
      }))
      .sort((a, b) => b.totalQueryInstances - a.totalQueryInstances),
  };
}
