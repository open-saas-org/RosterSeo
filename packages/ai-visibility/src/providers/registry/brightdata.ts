import type { Provider, ProviderOptions, ScrapeResult } from "../types";
import { collectAioSnippets, dedupeCitations, stripAioTitleNoise } from "../text-extraction";
import { PLAIN_SAMPLE_TIMEOUT_MS, WEB_QUERIES_UNAVAILABLE } from "../constants";

// Real browser-automation scraping infrastructure: drives the actual consumer
// UI (chatgpt.com, gemini.google.com, perplexity.ai, copilot) via BrightData's
// async dataset-collector trigger/poll/fetch lifecycle, plus a separate SERP
// call for Google's AI Overview (not a dataset collector - it's the AI
// summary block on a normal Google results page).
//
// Uses plain fetch against BrightData's public REST API throughout
// (trigger/progress/snapshot endpoints) instead of the `@brightdata/sdk`
// npm package, matching this project's established "raw fetch, no vendor
// SDKs" convention (dataforseo/google/bing packages all do this). One
// consequence: a best-effort "cancel an abandoned snapshot" cleanup step is
// not implemented here (no verified public REST cancel endpoint found) - an
// abandoned snapshot just expires on BrightData's side instead of being
// actively cancelled. Flagged here rather than guessing at an unverified
// endpoint.
//
// Dataset IDs below are real BrightData marketplace dataset ids - BrightData
// dataset ids can change, so these should be confirmed against a real
// BrightData dashboard before relying on them in production, same honesty
// convention as every other new integration in this project.

const AI_OVERVIEW_MODEL = "google-ai-overview";

const BD_DATASET_IDS: Record<string, string> = {
  chatgpt: "gd_m7aof0k82r803d5bjm",
  perplexity: "gd_m7dhdot1vw9a7gc1n",
  copilot: "gd_m7di5jy6s9geokz8w",
  gemini: "gd_mbz66arm2mf9cu856y",
};

const BD_BASE_URL: Record<string, string> = {
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/",
  copilot: "https://copilot.microsoft.com/chats",
  perplexity: "https://www.perplexity.ai/",
};

const BRIGHTDATA_REQUEST_URL = "https://api.brightdata.com/request";
const TERMINAL_FAILURE = new Set(["failed", "error", "cancelled"]);

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`, "Content-Type": "application/json" };
}

async function runGoogleAiOverview(prompt: string): Promise<ScrapeResult> {
  // `||`, not `??` - an empty-but-declared BRIGHTDATA_SERP_ZONE= in .env
  // sets this to "" (a real string), not undefined, so `??` would never
  // fall back and BrightData would reject the request with a real "zone is
  // not allowed to be empty" error.
  const zone = process.env.BRIGHTDATA_SERP_ZONE?.trim() || "sdk_serp";
  const url = `https://www.google.com/search?q=${encodeURIComponent(prompt)}&brd_json=1&brd_ai_overview=2&gl=us&hl=en`;

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(BRIGHTDATA_REQUEST_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ zone, url, method: "GET", format: "raw" }),
      signal: AbortSignal.timeout(PLAIN_SAMPLE_TIMEOUT_MS),
    });
    const text = await res.text();

    let parsed: any;
    if (res.ok && text.trim()) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-JSON body is a transient edge/error page - retry
      }
    }

    if (parsed !== undefined) {
      const aio = parsed?.ai_overview;
      const textContent = aio ? collectAioSnippets(aio).join("\n\n") : "";
      const refItems = Array.isArray(aio?.references) ? aio.references : Array.isArray(aio?.source_links) ? aio.source_links : [];
      const citations = dedupeCitations(
        refItems.map((r: any) => ({ url: typeof r === "string" ? r : r?.url, title: stripAioTitleNoise(typeof r === "string" ? undefined : r?.title) })),
      );
      return {
        textContent,
        webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
        citations,
        modelVersion: "brightdata-serp",
        rawOutput: parsed,
      };
    }

    lastError = `${res.status} ${text.slice(0, 200)}`.trim();
    // A "zone ... not found" 400 means the account genuinely has no zone by
    // this name - retrying identically 3x can't fix that, only a real
    // config change can. Fail fast with the actual fix instead of burning
    // the retry budget on a guaranteed-to-repeat error.
    if (/zone .* not found/i.test(lastError)) {
      throw new Error(
        `BrightData zone "${zone}" doesn't exist on this account. Log into your BrightData dashboard -> Proxies & Scraping and either rename/create a zone called "${zone}", or set BRIGHTDATA_SERP_ZONE in .env to match a real zone name you already have.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`BrightData SERP request failed after 3 attempts - ${lastError}`);
}

const KNOWN_TEXT_FIELDS = ["answer_text_markdown", "answer_text", "answer", "response_raw", "response", "text", "content"];

function findKnownTextField(record: Record<string, any>): string | null {
  for (const key of KNOWN_TEXT_FIELDS) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

function normalizeAnswer(record: Record<string, any>, model: string): string {
  const found = findKnownTextField(record);
  if (found) return found;
  // None of the known field names matched - this dataset's real response
  // shape has never been proven live against a funded account (see file
  // header note), so log the actual top-level keys once here rather than
  // silently falling back to a raw JSON dump. If mention detection keeps
  // coming back empty, check the server logs for this line - it tells you
  // exactly which real field BrightData used so normalizeAnswer/
  // extractSources/extractWebQueries can be corrected precisely.
  console.error(`[ai-visibility] brightdata/${model}: no known text field matched, real record keys: [${Object.keys(record).join(", ")}]`);
  return JSON.stringify(record).slice(0, 2000);
}

function extractSources(record: Record<string, any>) {
  const items: Array<{ url: unknown; title?: unknown }> = [];
  for (const field of ["citations", "links_attached", "sources"]) {
    const arr = record[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) items.push(typeof item === "string" ? { url: item } : { url: item?.url, title: item?.title });
  }
  return dedupeCitations(items);
}

// Don't gate on `web_search_triggered` - it's unreliable: real ChatGPT runs
// report `false` while still exposing a real query derived from the prompt.
function extractWebQueries(record: Record<string, any>): string[] {
  if (Array.isArray(record.web_search_query)) {
    return record.web_search_query.filter((q: unknown) => typeof q === "string" && q.trim());
  }
  const smq = record.metadata?.search_model_queries ?? record.search_model_queries;
  if (smq?.queries && Array.isArray(smq.queries)) return smq.queries.filter((q: unknown) => typeof q === "string" && q.trim());
  if (Array.isArray(smq)) return smq.filter((q: unknown) => typeof q === "string" && q.trim());
  return [];
}

async function getSnapshotStatus(snapshotId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
      headers: { Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "pending";
    const body = (await res.json()) as { status?: string };
    return body.status ?? "pending";
  } catch {
    return "pending";
  }
}

// Hard wall-clock cap, not just an attempt count - a real scrape typically
// finishes well under a minute, since it depends on a live browser session
// finishing. Previously this could wait up to ~8.5 minutes per single
// sample (60 attempts, backing off to a 10s interval) - with several
// targets/samples run concurrently that turned into the whole
// visibility-check request hanging for many minutes. 2 minutes is generous
// slack over the real-world case while still failing fast when something is
// actually stuck.
async function pollUntilReady(snapshotId: string): Promise<void> {
  const maxWaitMs = 120_000;
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    const status = await getSnapshotStatus(snapshotId);
    if (status === "ready") return;
    if (TERMINAL_FAILURE.has(status)) throw new Error(`BrightData snapshot ${snapshotId} ${status}`);
    const delay = Math.min(2000 * 2 ** Math.floor(attempt / 5), 10_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
  throw new Error(`BrightData snapshot ${snapshotId} timed out after ${Math.round(maxWaitMs / 1000)}s`);
}

export const brightdata: Provider = {
  id: "brightdata",
  name: "BrightData",
  access: "scraped",

  isConfigured() {
    return !!process.env.BRIGHTDATA_API_TOKEN;
  },

  async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
    if (model === AI_OVERVIEW_MODEL) return runGoogleAiOverview(prompt);

    const datasetId = options?.version ?? BD_DATASET_IDS[model];
    if (!datasetId) {
      throw new Error(
        `BrightData: no dataset ID for model "${model}". Use one of (${Object.keys(BD_DATASET_IDS).join(", ")}) or pass a dataset id via options.version.`,
      );
    }

    const triggerRes = await fetch(
      `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&notify=false&include_errors=true&format=json`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify([
          {
            url: BD_BASE_URL[model] ?? "",
            prompt,
            index: 1,
            ...(model === "chatgpt" ? { web_search: options?.webSearch ?? false } : {}),
          },
        ]),
        signal: AbortSignal.timeout(PLAIN_SAMPLE_TIMEOUT_MS),
      },
    );
    if (!triggerRes.ok) throw new Error(`BrightData trigger failed (${triggerRes.status}): ${await triggerRes.text()}`);
    const { snapshot_id: snapshotId } = (await triggerRes.json()) as { snapshot_id: string };

    await pollUntilReady(snapshotId);

    const fetchRes = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, {
      headers: { Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}` },
      signal: AbortSignal.timeout(PLAIN_SAMPLE_TIMEOUT_MS),
    });
    if (!fetchRes.ok) throw new Error(`BrightData snapshot fetch failed (${fetchRes.status}): ${await fetchRes.text()}`);
    const payload = await fetchRes.json();
    const record = (Array.isArray(payload) ? payload[0] : payload) ?? {};

    // The trigger requests include_errors=true - a per-item scrape failure
    // (blocked, captcha, no results, etc.) can come back as a real "error"
    // field even though the snapshot itself reports "ready". Surfacing this
    // as a thrown error (falls back to no-sample, not a fabricated result)
    // instead of silently treating an error record as an empty real answer.
    //
    // Confirmed live (this session) that a failed item doesn't always use
    // record.error/record.errors - a real observed failure came back as a
    // "thin" { status, message } record instead (no error/errors field at
    // all), which the two checks above missed entirely and fell through to
    // normalizeAnswer's "no known text field matched" fallback - silently
    // treating the error message as if it were the AI's real answer text.
    // A record with no known content field but a status/message is never a
    // legitimate empty-but-real answer, so it's always an error.
    if (record.error || record.errors) {
      throw new Error(`BrightData ${model} scrape error: ${JSON.stringify(record.error ?? record.errors).slice(0, 300)}`);
    }
    if (!findKnownTextField(record) && (record.status !== undefined || record.message !== undefined)) {
      throw new Error(`BrightData ${model} scrape error: ${JSON.stringify({ status: record.status, message: record.message }).slice(0, 300)}`);
    }

    const citations = extractSources(record);
    const webQueries = extractWebQueries(record);

    return {
      textContent: normalizeAnswer(record, model),
      webQueries: options?.webSearch
        ? webQueries.length > 0
          ? webQueries
          : citations.length > 0
            ? [WEB_QUERIES_UNAVAILABLE]
            : []
        : [],
      citations,
      modelVersion: record?.model ?? undefined,
      rawOutput: record,
    };
  },
};
