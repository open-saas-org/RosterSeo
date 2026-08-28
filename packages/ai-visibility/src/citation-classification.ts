// Real-time citation classification: what kind of source a cited URL is
// (brand / competitor / editorial / ... ) and what kind of page it is
// (homepage / article / review / ...). Modeled on Elmo's
// elmo-reference/apps/web/src/lib/domain-categories.ts approach (classify at
// read time from url/domain/title, never store a category column - so
// reclassification logic changes apply retroactively with no backfill) but
// reimplemented against our own schema, with a compact curated domain list
// rather than Elmo's ~25k-entry editorial list: the page-type heuristic
// below (classifyUrl's "other" -> page-type reclassification) is what keeps
// long-tail blogs/publishers out of the "other" bucket without needing that
// list.

export type CitationCategory =
  | "brand"
  | "competitor"
  | "editorial"
  | "reviews"
  | "ecommerce"
  | "social"
  | "developer"
  | "pr"
  | "reference"
  | "institutional"
  | "other";

export type CitationPageType =
  | "homepage"
  | "article"
  | "listicle"
  | "howto"
  | "comparison"
  | "review"
  | "product"
  | "doc"
  | "forum"
  | "video"
  | "info"
  | "other";

export interface CategoryConfigEntry {
  label: string;
  badgeClass: string;
  // Fixed chart color for the 6 categories broken out individually in the
  // two stacked area charts (matches the app's validated --chart-1..6
  // palette - apps/web/app/globals.css). Categories without one fold into
  // the "other" band there, but keep their own badge color everywhere else
  // (Top Domains bars, Top URLs badges), since those aren't an all-pairs
  // adjacent-color chart context.
  chartColorVar?: string;
}

export const CATEGORY_CONFIG: Record<CitationCategory, CategoryConfigEntry> = {
  brand: { label: "Brand", badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400", chartColorVar: "var(--chart-1)" },
  competitor: { label: "Competitor", badgeClass: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400", chartColorVar: "var(--chart-2)" },
  editorial: { label: "Editorial", badgeClass: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400", chartColorVar: "var(--chart-3)" },
  social: { label: "Social", badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400", chartColorVar: "var(--chart-4)" },
  ecommerce: { label: "Ecommerce", badgeClass: "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-400", chartColorVar: "var(--chart-5)" },
  reviews: { label: "Reviews", badgeClass: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400", chartColorVar: "var(--chart-6)" },
  developer: { label: "Developer", badgeClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  pr: { label: "PR", badgeClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  reference: { label: "Reference", badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  institutional: { label: "Institutional", badgeClass: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  other: { label: "Other", badgeClass: "border-muted-foreground/30 bg-muted text-muted-foreground" },
};

export const PAGE_TYPE_LABELS: Record<CitationPageType, string> = {
  homepage: "Homepage",
  article: "Article",
  listicle: "Listicle",
  howto: "Guide",
  comparison: "Comparison",
  review: "Review",
  product: "Product",
  doc: "Docs",
  forum: "Forum",
  video: "Video",
  info: "Info",
  other: "Other",
};

const FORUM_DOMAINS = new Set([
  "reddit.com",
  "quora.com",
  "stackexchange.com",
  "news.ycombinator.com",
  "producthunt.com",
  "indiehackers.com",
  "discourse.org",
]);

const PR_DOMAINS = new Set(["prnewswire.com", "businesswire.com", "globenewswire.com", "prweb.com", "einpresswire.com"]);

const REVIEW_DOMAINS = new Set([
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "trustradius.com",
  "gartner.com",
  "getapp.com",
  "softwareadvice.com",
  "yelp.com",
  "glassdoor.com",
  "producthunt.com",
]);

const ECOMMERCE_DOMAINS = new Set([
  "amazon.com",
  "ebay.com",
  "walmart.com",
  "target.com",
  "etsy.com",
  "aliexpress.com",
  "shopify.com",
  "bestbuy.com",
  "homedepot.com",
]);

const SOCIAL_DOMAINS = new Set([
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "threads.net",
  "reddit.com",
]);

const DEVELOPER_DOMAINS = new Set([
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "npmjs.com",
  "pypi.org",
  "huggingface.co",
  "developer.mozilla.org",
  "npm.im",
  "devto.com",
  "dev.to",
]);

const REFERENCE_DOMAINS = new Set([
  "wikipedia.org",
  "britannica.com",
  "dictionary.com",
  "merriam-webster.com",
  "crunchbase.com",
  "imdb.com",
  "investopedia.com",
]);

const INSTITUTIONAL_DOMAINS = new Set(["nih.gov", "cdc.gov", "who.int", "un.org", "europa.eu"]);
const INSTITUTIONAL_TLDS = new Set(["edu", "gov", "mil", "int"]);
const INSTITUTIONAL_SECOND_LEVEL = new Set(["edu", "gov", "org", "ac", "mil", "govt", "gob"]);

function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function inDomainSet(domain: string, set: Set<string>): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  let cursor = host;
  while (cursor) {
    if (set.has(cursor)) return true;
    const dot = cursor.indexOf(".");
    if (dot === -1) break;
    cursor = cursor.slice(dot + 1);
  }
  return false;
}

function matchesTrackedDomain(domain: string, tracked: string[]): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return tracked.some((t) => {
    const target = t.toLowerCase().replace(/^www\./, "");
    return host === target || host.endsWith(`.${target}`);
  });
}

export function categorizeDomain(domain: string, brandDomains: string[], competitorDomains: string[]): CitationCategory {
  if (matchesTrackedDomain(domain, brandDomains)) return "brand";
  if (matchesTrackedDomain(domain, competitorDomains)) return "competitor";
  if (inDomainSet(domain, FORUM_DOMAINS) || /^(forums?|community|discuss|boards?)\./.test(domain.toLowerCase())) return "social";
  if (inDomainSet(domain, PR_DOMAINS)) return "pr";
  if (inDomainSet(domain, REVIEW_DOMAINS)) return "reviews";
  if (inDomainSet(domain, ECOMMERCE_DOMAINS)) return "ecommerce";
  if (inDomainSet(domain, SOCIAL_DOMAINS)) return "social";
  if (inDomainSet(domain, DEVELOPER_DOMAINS)) return "developer";
  if (inDomainSet(domain, REFERENCE_DOMAINS)) return "reference";
  if (inDomainSet(domain, INSTITUTIONAL_DOMAINS)) return "institutional";
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  if (INSTITUTIONAL_TLDS.has(tld)) return "institutional";
  const reg = registrableDomain(domain);
  const secondLevel = reg.split(".")[0] ?? "";
  if (tld === "org" || INSTITUTIONAL_SECOND_LEVEL.has(secondLevel)) return "institutional";
  return "other";
}

// Regex cascade over URL path + title - order matters, first match wins.
// Trimmed from Elmo's version: no Google shopping/search surfaces (we don't
// have a separate Google AI Mode module).
export function inferPageType(url: string, title?: string | null): CitationPageType {
  let path = "/";
  let host = "";
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // fall through with defaults
  }
  const t = (title ?? "").toLowerCase();
  const hay = `${path} ${t}`;

  if (path === "/" || path === "") return "homepage";
  if (["youtube.com", "youtu.be", "vimeo.com", "tiktok.com"].some((h) => host === h || host.endsWith(`.${h}`)) || /\b(watch|shorts|embed|videos?)\//.test(path)) {
    return "video";
  }
  if (inDomainSet(host, FORUM_DOMAINS) || /\b(comments|forums?|threads?|viewtopic|discussion)\b/.test(path) || /\/r\//.test(path)) {
    return "forum";
  }
  if (/\b(docs?|documentation|developers?|api|sdk|reference)\b/.test(path)) return "doc";
  if (/\breview(s|ed)?\b/.test(hay)) return "review";
  if (/\b(vs\.?|versus|alternatives?|comparison)\b/.test(hay) || /\/(compare|vs|alternatives)\b/.test(path)) return "comparison";
  if (/\d+\s+best|best\s+\d+/.test(hay) || /\bbest-/.test(path)) return "listicle";
  if (/\bhow to\b|\bguide\b|\btutorial\b|step-by-step/.test(hay)) return "howto";
  if (/\b(dp|gp\/product|pdp|products?|item|shop|store|collections|buy|cart|pricing|plans?)\b/.test(path)) return "product";
  if (/\b(about|faq|shipping|returns|careers|contact|privacy|terms)\b/.test(path)) return "info";
  if (/\b(support|help|kb)\b/.test(path)) return "doc";
  if (/\b(blog|news|articles?|posts?|magazine)\b/.test(path) || /\/\d{4}\/\d{2}\//.test(path)) return "article";
  return "other";
}

function resolvePageType(pageType: CitationPageType, category: CitationCategory): CitationPageType {
  if (pageType === "other" && (category === "editorial" || category === "institutional" || category === "reference")) {
    return "article";
  }
  return pageType;
}

export interface ClassifiedCitation {
  category: CitationCategory;
  pageType: CitationPageType;
}

// Long-tail fallback: a domain the curated lists don't recognize still gets
// a real category from what kind of page it is, instead of defaulting to
// "other" for every unlisted blog/publisher.
//
// brandDomains/competitorDomains are flat domain lists, but each list is
// expected to already include the owner's alternate domains - e.g. the
// caller should pass [project.domain, ...(project.aiVisibilityAdditionalDomains
// ?? [])] as brandDomains, and competitors.flatMap(c => [c.domain,
// ...(c.additionalDomains ?? [])]) as competitorDomains - so a citation on a
// brand's blog subdomain or a competitor's regional site still classifies
// as "brand"/"competitor" instead of falling through to "other".
export function classifyUrl(url: string, domain: string, title: string | undefined, brandDomains: string[], competitorDomains: string[]): ClassifiedCitation {
  let category = categorizeDomain(domain, brandDomains, competitorDomains);
  const rawPageType = inferPageType(url, title);

  if (category === "other") {
    if (rawPageType === "forum") category = "social";
    else if (["article", "listicle", "howto", "comparison", "review"].includes(rawPageType)) category = "editorial";
    else if (rawPageType === "product") category = "ecommerce";
  }

  return { category, pageType: resolvePageType(rawPageType, category) };
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}`;
  } catch {
    return url.toLowerCase();
  }
}

export function isRedditDomain(domain: string): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return host === "reddit.com" || host.endsWith(".reddit.com");
}

export function extractSubreddit(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([^/?#]+)/i);
  return match ? `r/${match[1]}` : null;
}
