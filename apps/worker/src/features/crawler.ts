import { fetchAndParse, normalizeUrl, assertPublicHost, type CrawledPageResult } from "@rosterseo/crawler";

// BFS/robots.txt/frontier logic for Site Audit's multi-page crawl. The
// single-page fetch+parse itself (fetchAndParse/normalizeUrl) lives in
// @rosterseo/crawler, shared with Page Analyzer's single-page real crawl -
// see that package for why.
export type { CrawledPageResult };

const USER_AGENT = "RosterSEOBot/1.0 (+https://github.com/open-saas-org/RosterSeo; site audit crawler)";
const DEFAULT_CONCURRENCY = 5;

// Hard wall-clock cap on the whole crawl, not just a per-page timeout.
// maxPages is now a very high safety ceiling, not a real target (see
// site-audit-launch-control.tsx) - a real crawl is meant to run until its
// frontier is exhausted, so this deadline (not a page count) is the actual
// backstop against a pathologically slow/stuck site tying up a worker slot
// indefinitely. 6 hours comfortably covers a real large site at the
// observed real-world rate (~2 pages/sec) - tens of thousands of pages -
// while still failing a genuinely stuck crawl instead of running forever.
// packages/jobs/src/site-audit-job.ts's expireInSeconds must stay above
// this (with margin) or pg-boss will "helpfully" redeliver a still-healthy
// long crawl to a second worker - see that file's own comment for what
// that bug looked like.
const MAX_CRAWL_DURATION_MS = 6 * 60 * 60 * 1000;

// A small delay between BFS waves so the crawler isn't hammering the
// target's server as fast as each wave completes - concurrency already
// caps how many requests are in flight at once, this caps how fast waves
// follow each other.
const WAVE_DELAY_MS = 250;

interface RobotsRules {
  disallow: string[];
}

// Pragmatic subset of robots.txt: only the `User-agent: *` group's
// `Disallow` prefixes. No wildcard globbing, no crawl-delay, no sitemap
// directive parsing (that's handled separately via getSitemapUrls).
export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  try {
    await assertPublicHost(origin);
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { disallow: [] };
    const text = await res.text();

    const disallow: string[] = [];
    let applies = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      if (key === "user-agent") {
        applies = value === "*";
      } else if (key === "disallow" && applies && value) {
        disallow.push(value);
      }
    }
    return { disallow };
  } catch {
    return { disallow: [] };
  }
}

function isDisallowed(pathname: string, rules: RobotsRules): boolean {
  return rules.disallow.some((prefix) => pathname.startsWith(prefix));
}

export interface CrawlOptions {
  seedUrls: string[];
  maxPages: number;
  concurrency?: number;
  onPageCrawled: (page: CrawledPageResult, discoveredCount: number, crawledCount: number, depth: number) => Promise<void> | void;
  shouldStop?: () => Promise<boolean>;
}

export interface CrawlResult {
  // true only when the frontier was fully drained (queue.length === 0) -
  // false on hitting maxPages, the wall-clock deadline, or shouldStop().
  // Orphan-page detection (audit-runner.ts) only trusts a complete link
  // graph, so it gates on this - a truncated crawl makes almost every page
  // look orphaned (nothing left to prove otherwise), a real false-positive
  // risk the reference implementation this was ported from explicitly
  // calls out.
  completed: boolean;
}

// Concurrency-limited BFS in waves: take up to `concurrency` queued URLs,
// fetch them in parallel, collect newly discovered same-origin links from
// the batch, then repeat. Simpler and race-free compared to a persistent
// worker-pool, at the cost of only as much parallelism as the current wave
// has queued URLs for (fine for this use case).
export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const { seedUrls, maxPages, onPageCrawled, shouldStop } = options;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  if (seedUrls.length === 0) return { completed: true };
  const rootOrigin = new URL(seedUrls[0]).origin;
  const robots = await fetchRobotsRules(rootOrigin);

  const seen = new Set<string>();
  // Real BFS link-distance from the seed set (0 = a seed URL itself), not
  // just "processed in roughly level order" - a page found ONLY via a deep
  // internal link, even if fetched early because of wave/concurrency
  // timing, still reports its true shortest distance. Populated as each
  // URL is first discovered; never revised down since BFS discovery order
  // already guarantees the first depth seen is the shortest.
  const depthByUrl = new Map<string, number>();
  let queue: string[] = [];
  for (const seed of seedUrls) {
    const normalized = normalizeUrl(seed, seed);
    if (!normalized) continue;
    let path = "/";
    try {
      path = new URL(normalized).pathname;
    } catch {
      // keep default
    }
    if (isDisallowed(path, robots)) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      depthByUrl.set(normalized, 0);
      queue.push(normalized);
    }
  }

  // Distinct from maxPages: this bounds how many candidate URLs the
  // frontier ever tracks (memory safety against a pathological site that
  // generates unbounded unique links - infinite calendar/faceted-filter
  // URLs, etc.), not a target page count. Kept as a flat ceiling rather
  // than scaling with maxPages now that maxPages itself is a generous
  // 100,000-page safety ceiling (see site-audit-launch-control.tsx) - a
  // frontier of hundreds of thousands of tracked URLs stops being a
  // meaningful memory guard.
  const frontierCap = 200_000;
  let crawledCount = 0;
  const deadline = Date.now() + MAX_CRAWL_DURATION_MS;
  let isFirstWave = true;

  while (queue.length > 0 && crawledCount < maxPages) {
    if (shouldStop && (await shouldStop())) return { completed: false };
    if (Date.now() > deadline) return { completed: false };

    if (!isFirstWave && WAVE_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, WAVE_DELAY_MS));
    }
    isFirstWave = false;

    const batchSize = Math.min(concurrency, maxPages - crawledCount, queue.length);
    const batch = queue.splice(0, batchSize);
    const results = await Promise.all(batch.map((url) => fetchAndParse(url)));

    const nextLinks: string[] = [];
    for (const page of results) {
      crawledCount++;
      const pageDepth = depthByUrl.get(page.url) ?? 0;
      if (crawledCount < maxPages && seen.size < frontierCap) {
        for (const link of page.links) {
          if (seen.size >= frontierCap) break;
          let path = "/";
          try {
            path = new URL(link).pathname;
          } catch {
            // keep default
          }
          if (isDisallowed(path, robots)) continue;
          if (!seen.has(link)) {
            seen.add(link);
            depthByUrl.set(link, pageDepth + 1);
            nextLinks.push(link);
          }
        }
      }
    }
    queue.push(...nextLinks);

    for (const page of results) {
      await onPageCrawled(page, seen.size, crawledCount, depthByUrl.get(page.url) ?? 0);
    }
  }

  // Loop exited because the condition became false, not via an early
  // return above - completed only if the frontier actually drained, not
  // because the page cap was hit first.
  return { completed: queue.length === 0 };
}
