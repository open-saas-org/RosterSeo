import * as cheerio from "cheerio";
import { fetchFollowingRedirects, readTextWithLimit, USER_AGENT } from "./fetch-and-parse";

// Free, no-API contact-email discovery for Backlink Outreach: checks a
// domain's homepage and its most common "here's how to reach us" pages for
// a real published mailto: link or email-pattern text. Real crawl, same
// SSRF-checked fetch path as fetchAndParse - not a guess (no info@/contact@
// pattern-guessing, no WHOIS - see the Outreach feature's own design notes
// on why those don't work well: WHOIS is mostly GDPR-redacted now, and
// guessed addresses can't be told apart from real ones without an SMTP
// probe, which risks sender reputation for no real gain).

const CANDIDATE_PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us"];
const FETCH_TIMEOUT_MS = 8_000;
const MAX_PAGES_CHECKED = 5;

// Deliberately excludes common non-contact addresses (image/font/CSS file
// names that happen to look like an email in a minified bundle, tracking
// pixels, etc.) - a real published contact address, not noise.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EXCLUDED_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "godaddy.com", "domain.com"];
const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js"];

function isLikelyRealContactEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  const emailDomain = lower.split("@")[1] ?? "";
  return !EXCLUDED_DOMAINS.some((d) => emailDomain.endsWith(d));
}

function extractEmails(html: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const email = href.replace(/^mailto:/i, "").split("?")[0]?.trim();
    if (email) found.add(email);
  });

  // Plain-text emails too (not every site wraps its address in a real
  // mailto: link) - scoped to visible body text, not raw HTML/scripts, so
  // a minified JS bundle's stray "@"-containing string can't match.
  const bodyText = $("body").text();
  for (const match of bodyText.matchAll(EMAIL_PATTERN)) found.add(match[0]);

  return [...found].filter(isLikelyRealContactEmail);
}

export type ContactEmailResult = {
  email: string;
  sourceUrl: string;
};

// Checks up to MAX_PAGES_CHECKED real pages in priority order (homepage
// first, since that's the most common place); stops and returns the first
// real email found, with the exact page it came from - the Outreach UI
// shows that source so the found address isn't a black box.
export async function findContactEmail(domain: string): Promise<ContactEmailResult | null> {
  const baseUrl = `https://${domain}`;

  for (const path of CANDIDATE_PATHS.slice(0, MAX_PAGES_CHECKED)) {
    const url = new URL(path, baseUrl).toString();
    try {
      const { res, finalUrl } = await fetchFollowingRedirects(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;

      const html = await readTextWithLimit(res);
      const emails = extractEmails(html);
      if (emails.length > 0) return { email: emails[0]!, sourceUrl: finalUrl };
    } catch {
      // A single candidate page failing (404, timeout, blocked) isn't a
      // real error for this feature - just try the next one.
      continue;
    }
  }

  return null;
}
