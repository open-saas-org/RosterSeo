import * as cheerio from "cheerio";
import { assertPublicHost } from "./ssrf-guard";

// Real single-page fetch + HTML parse: shared by Site Audit
// (apps/worker/src/features/crawler.ts, which adds BFS/robots.txt/frontier
// logic on top) and Page Analyzer (apps/web/components/page-analyzer/analysis.ts)
// so both flagship features agree on what "missing alt text", "word count",
// etc. actually mean - one real implementation, not two that can drift.

export interface CrawledPageResult {
  url: string;
  statusCode: number;
  redirectedTo: string | null;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  loadTimeMs: number;
  canonicalUrl: string | null;
  noindex: boolean;
  // Raw <meta name="robots"> content attribute, verbatim (e.g. "index,
  // follow, max-image-preview:large") - null when the tag is absent.
  // `noindex` above is just the one directive Site Audit's existing issue
  // check cares about; this is the full string for a real technical-audit
  // "Meta Robots" column.
  metaRobots: string | null;
  // First 2 H2s, verbatim - cheap enough (a couple more Cheerio selector
  // calls on HTML already parsed for h1Count) to capture unconditionally
  // rather than gating behind captureContent like bodyText/h1Text below.
  h2Texts: string[];
  links: string[];
  externalLinkCount: number;
  externalLinks: string[];
  fetchError?: string;
  // Only populated when `captureContent: true` is passed - real page text
  // discarded by default so Site Audit's BFS crawl (hundreds/thousands of
  // pages per run) doesn't carry the storage/memory cost of a feature it
  // doesn't use. Page Analyzer opts in for its ~11 real fetches per run.
  bodyText?: string;
  h1Text?: string[];
  // Also captureContent-gated (see above) - every schema.org @type found
  // across every <script type="application/ld+json"> block on the page
  // (arrays and @graph wrappers flattened), and the first Product node's
  // real fields when present. Powers Page Analyzer's page-type detection
  // and product/price comparison - never inferred/guessed, only what the
  // page's own structured data actually declares.
  jsonLdTypes?: string[];
  jsonLdProduct?: ProductJsonLd | null;
}

// Real fields pulled from a schema.org Product JSON-LD node - null for any
// field the page's own markup doesn't declare, never fabricated/estimated.
export interface ProductJsonLd {
  name: string | null;
  price: number | null;
  priceCurrency: string | null;
  // Raw schema.org value with the "https://schema.org/" prefix stripped
  // (e.g. "InStock", "OutOfStock") - shown verbatim, not remapped, so the
  // UI never claims a stock status the page didn't actually declare.
  availability: string | null;
  ratingValue: number | null;
  reviewCount: number | null;
  brand: string | null;
}

export interface FetchAndParseOptions {
  captureContent?: boolean;
}

export const USER_AGENT = "RosterSEOBot/1.0 (+https://github.com/open-saas-org/RosterSeo; page crawler)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_LINKS_PER_PAGE = 500;
const MAX_EXTERNAL_LINKS_PER_PAGE = 500;
const MAX_REDIRECTS = 10;

// Follows redirects manually (rather than fetch's own `redirect: "follow"`)
// so every hop - not just the first URL - gets a real SSRF check before
// it's requested. A public-looking URL that 302s to an internal address
// would otherwise sail straight through.
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB - generous for a real page, small enough to bound worker memory under Site Audit's concurrent BFS crawl

// Reads a response body as text with a hard byte cap AND real charset
// detection, instead of the unbounded res.text() this used to call.
//
// Size: a multi-hundred-MB response (malicious or just misconfigured) used
// to be fully buffered into memory before anything downstream got a chance
// to reject it. Checks Content-Length up front when present, and also caps
// a chunked response (no Content-Length) by counting bytes as they stream
// in.
//
// Charset: res.text() only ever looks at the Content-Type header's charset
// param (defaulting to UTF-8 if absent), per the Fetch spec - a page
// served as windows-1252/Shift-JIS/etc. with no charset in its headers
// would silently decode as mojibake. This also sniffs a <meta charset>
// tag in the first 1KB (the real-world fallback browsers use when the
// server doesn't declare one), which res.text() never did.
export async function readTextWithLimit(res: Response): Promise<string> {
  const declaredLength = Number(res.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    throw new Error(`Response body too large (${declaredLength} bytes, cap is ${MAX_BODY_BYTES})`);
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error(`Response body too large (exceeded ${MAX_BODY_BYTES} bytes while streaming)`);
    }
    chunks.push(value);
  }
  const bytes = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks);

  const headerCharset = (res.headers.get("content-type") ?? "").match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const metaCharset = headerCharset
    ? undefined
    : Buffer.from(bytes.subarray(0, 1024)).toString("ascii").match(/<meta[^>]+charset=["']?([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
  const charset = headerCharset || metaCharset || "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // Unknown/unsupported charset label - fall back rather than throw, same
    // "never let an edge case abort the whole crawl" spirit as everywhere
    // else in this function.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// Exported (not just used internally by fetchAndParse) so other real-fetch
// call sites in this package - e.g. find-contact-email.ts - get the same
// SSRF-checked-on-every-hop, manual-redirect-following behavior instead of
// a second, easier-to-get-wrong copy of it.
export async function fetchFollowingRedirects(url: string, init: RequestInit): Promise<{ res: Response; finalUrl: string }> {
  let currentUrl = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicHost(currentUrl);
    const res = await fetch(currentUrl, { ...init, redirect: "manual" });
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get("location");
    if (!isRedirect || !location) return { res, finalUrl: currentUrl };
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`Too many redirects fetching ${url}`);
}

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a: URL, b: URL): boolean {
  return a.hostname.replace(/^www\./, "").toLowerCase() === b.hostname.replace(/^www\./, "").toLowerCase();
}

// Flattens a parsed JSON-LD document into a list of plain node objects -
// handles the three real shapes sites actually emit: a single object, an
// array of objects, and a `@graph` wrapper (array nested one level deeper
// inside an object that also carries `@context`).
function flattenJsonLdNodes(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.flatMap(flattenJsonLdNodes);
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) return (obj["@graph"] as unknown[]).flatMap(flattenJsonLdNodes);
    return [obj];
  }
  return [];
}

function jsonLdTypeNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseProductNode(node: Record<string, unknown>): ProductJsonLd {
  const offersRaw = node.offers;
  const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
  const offerObj = offer && typeof offer === "object" ? (offer as Record<string, unknown>) : null;

  const ratingRaw = node.aggregateRating;
  const ratingObj = ratingRaw && typeof ratingRaw === "object" ? (ratingRaw as Record<string, unknown>) : null;

  const brandRaw = node.brand;
  const brand =
    typeof brandRaw === "string"
      ? brandRaw
      : brandRaw && typeof brandRaw === "object" && typeof (brandRaw as Record<string, unknown>).name === "string"
        ? ((brandRaw as Record<string, unknown>).name as string)
        : null;

  const availabilityRaw = offerObj?.availability;
  const availability = typeof availabilityRaw === "string" ? availabilityRaw.replace(/^https?:\/\/schema\.org\//, "") : null;

  return {
    name: typeof node.name === "string" ? node.name : null,
    price: toFiniteNumber(offerObj?.price ?? offerObj?.lowPrice),
    priceCurrency: typeof offerObj?.priceCurrency === "string" ? (offerObj.priceCurrency as string) : null,
    availability,
    ratingValue: toFiniteNumber(ratingObj?.ratingValue),
    reviewCount: toFiniteNumber(ratingObj?.reviewCount ?? ratingObj?.ratingCount),
    brand,
  };
}

// Reads every <script type="application/ld+json"> block on the page (each
// wrapped in its own try/catch - malformed JSON-LD is common in the wild
// and must never fail a crawl) and returns every real @type declared plus
// the first Product node's real fields, if any.
function extractJsonLd($: cheerio.CheerioAPI): { types: string[]; product: ProductJsonLd | null } {
  const types = new Set<string>();
  let product: ProductJsonLd | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const node of flattenJsonLdNodes(parsed)) {
      const nodeTypes = jsonLdTypeNames(node["@type"]);
      nodeTypes.forEach((t) => types.add(t));
      if (!product && nodeTypes.includes("Product")) {
        product = parseProductNode(node);
      }
    }
  });

  return { types: [...types], product };
}

async function fetchAndParseOnce(url: string, options?: FetchAndParseOptions): Promise<CrawledPageResult> {
  const captureContent = options?.captureContent ?? false;
  const start = Date.now();
  try {
    const { res, finalUrl: resolvedUrl } = await fetchFollowingRedirects(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const loadTimeMs = Date.now() - start;
    const finalUrl = resolvedUrl !== url ? resolvedUrl : null;
    const contentType = res.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return {
        url,
        statusCode: res.status,
        redirectedTo: finalUrl,
        title: null,
        metaDescription: null,
        h1Count: 0,
        wordCount: 0,
        imageCount: 0,
        imagesMissingAlt: 0,
        loadTimeMs,
        canonicalUrl: null,
        noindex: false,
        metaRobots: null,
        h2Texts: [],
        links: [],
        externalLinkCount: 0,
        externalLinks: [],
      };
    }

    const html = await readTextWithLimit(res);
    const $ = cheerio.load(html);

    const jsonLd = captureContent ? extractJsonLd($) : null;

    const title = $("title").first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
    const h1Count = $("h1").length;
    const h2Texts = $("h2")
      .slice(0, 2)
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(" ").filter(Boolean).length;

    const images = $("img");
    let imagesMissingAlt = 0;
    images.each((_, el) => {
      const alt = $(el).attr("alt");
      if (!alt || !alt.trim()) imagesMissingAlt++;
    });

    const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
    const robotsMetaRaw = $('meta[name="robots"]').attr("content")?.trim() || null;
    const noindex = /noindex/i.test(robotsMetaRaw ?? "");

    const baseUrl = finalUrl || url;
    const originUrl = new URL(baseUrl);
    const linkSet = new Set<string>();
    const externalLinkSet = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const normalized = normalizeUrl(href, baseUrl);
      if (!normalized) return;
      let linkUrl: URL;
      try {
        linkUrl = new URL(normalized);
      } catch {
        return;
      }
      if (!sameOrigin(linkUrl, originUrl)) {
        if (externalLinkSet.size < MAX_EXTERNAL_LINKS_PER_PAGE) externalLinkSet.add(normalized);
        return;
      }
      if (linkSet.size < MAX_LINKS_PER_PAGE) linkSet.add(normalized);
    });

    return {
      url,
      statusCode: res.status,
      redirectedTo: finalUrl,
      title,
      metaDescription,
      h1Count,
      wordCount,
      imageCount: images.length,
      imagesMissingAlt,
      loadTimeMs,
      canonicalUrl,
      metaRobots: robotsMetaRaw,
      h2Texts,
      noindex,
      links: [...linkSet],
      externalLinkCount: externalLinkSet.size,
      externalLinks: [...externalLinkSet],
      ...(captureContent
        ? {
            bodyText,
            h1Text: $("h1")
              .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
              .get()
              .filter(Boolean),
            jsonLdTypes: jsonLd!.types,
            jsonLdProduct: jsonLd!.product,
          }
        : {}),
    };
  } catch (err) {
    return {
      url,
      statusCode: 0,
      redirectedTo: null,
      title: null,
      metaDescription: null,
      h1Count: 0,
      wordCount: 0,
      imageCount: 0,
      imagesMissingAlt: 0,
      loadTimeMs: Date.now() - start,
      canonicalUrl: null,
      noindex: false,
      metaRobots: null,
      h2Texts: [],
      links: [],
      externalLinkCount: 0,
      externalLinks: [],
      fetchError: err instanceof Error ? err.message : String(err),
    };
  }
}

// A network-level failure (timeout, connection reset, DNS blip, a
// redirect-chain hiccup) is often transient, not a real dead page - a
// site's own server can momentarily struggle under a crawl wave's
// concurrent requests to the same section (several /brand/* pages
// discovered off one nav menu, all fetched in the same BFS wave) even
// though every one of those URLs works fine on its own. Real crawlers
// (Screaming Frog included) retry a fetch failure before calling a page
// broken; this didn't, so a handful of perfectly live pages could get
// permanently marked "Error" (statusCode 0) off one bad moment. A REAL
// HTTP response - even a 403/500 - is never retried here: that's the
// server's genuine answer, not a fetch failure, and belongs in the result
// as real data.
const MAX_FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export async function fetchAndParse(url: string, options?: FetchAndParseOptions): Promise<CrawledPageResult> {
  let result = await fetchAndParseOnce(url, options);
  for (let attempt = 1; result.statusCode === 0 && attempt <= MAX_FETCH_RETRIES; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await fetchAndParseOnce(url, options);
  }
  return result;
}
