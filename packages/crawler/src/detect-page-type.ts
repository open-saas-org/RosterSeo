import type { CrawledPageResult } from "./fetch-and-parse";

// Rule-based page-type detection for Page Analyzer - deterministic and
// transparent (every decision records the real signal it came from in
// `reasons`), never an AI guess. Requires `captureContent: true` on the
// crawl (jsonLdTypes/bodyText) for the strongest signals; still gives a
// best-effort URL-only answer without it.

export type PageType = "homepage" | "product" | "category" | "article" | "standard";

export type PageTypeSignal = {
  type: PageType;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

const PRODUCT_JSONLD_TYPES = new Set(["Product"]);
const CATEGORY_JSONLD_TYPES = new Set(["CollectionPage", "ItemList", "OfferCatalog"]);
const ARTICLE_JSONLD_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "TechArticle"]);

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function detectPageType(crawl: CrawledPageResult, url: string): PageTypeSignal {
  // 1. JSON-LD @type - the strongest real signal, the site's own
  // structured-data declaration of what this page is.
  const types = crawl.jsonLdTypes ?? [];
  if (types.some((t) => PRODUCT_JSONLD_TYPES.has(t))) {
    return { type: "product", confidence: "high", reasons: [`JSON-LD declares @type "Product"`] };
  }
  if (types.some((t) => CATEGORY_JSONLD_TYPES.has(t))) {
    const match = types.find((t) => CATEGORY_JSONLD_TYPES.has(t));
    return { type: "category", confidence: "high", reasons: [`JSON-LD declares @type "${match}"`] };
  }
  if (types.some((t) => ARTICLE_JSONLD_TYPES.has(t))) {
    const match = types.find((t) => ARTICLE_JSONLD_TYPES.has(t));
    return { type: "article", confidence: "high", reasons: [`JSON-LD declares @type "${match}"`] };
  }

  // 2. URL path heuristics - medium confidence, used when JSON-LD is
  // absent or didn't declare a recognized type.
  const path = pathnameOf(url).toLowerCase();
  if (path === "" || path === "/") {
    return { type: "homepage", confidence: "high", reasons: ["URL is the site root"] };
  }
  if (/\/(products?|p)\//.test(path)) {
    return { type: "product", confidence: "medium", reasons: [`URL path matches a product pattern (${path})`] };
  }
  if (/\/(collections?|categor(y|ies)|shop)\//.test(path)) {
    return { type: "category", confidence: "medium", reasons: [`URL path matches a category pattern (${path})`] };
  }
  if (/\/(blog|articles?|news)\//.test(path)) {
    return { type: "article", confidence: "medium", reasons: [`URL path matches an article pattern (${path})`] };
  }

  // 3. Content heuristics - low confidence last resort, only possible when
  // captureContent gave us bodyText.
  const body = crawl.bodyText;
  if (body) {
    const priceMatches = body.match(/\$\s?\d+(\.\d{2})?/g) ?? [];
    if (priceMatches.length >= 5 && crawl.links.length > 20) {
      return {
        type: "category",
        confidence: "low",
        reasons: [`${priceMatches.length} price-like tokens alongside ${crawl.links.length} internal links suggest a listing page`],
      };
    }
    if (priceMatches.length >= 1 && crawl.wordCount < 1500) {
      return {
        type: "product",
        confidence: "low",
        reasons: [`A price-like token found on a relatively short (${crawl.wordCount}-word) page`],
      };
    }
    if (crawl.wordCount > 600) {
      return {
        type: "article",
        confidence: "low",
        reasons: [`Long-form content (${crawl.wordCount} words) with no strong product/category signal`],
      };
    }
  }

  return { type: "standard", confidence: "low", reasons: ["No JSON-LD, URL, or content signal matched a specific page type"] };
}
