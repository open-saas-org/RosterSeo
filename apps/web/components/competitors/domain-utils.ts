// Shared by the competitors page (client-side, pre-submit validation) and
// the competitors API route (server-side, authoritative validation) so the
// two never drift. Deliberately dependency-free (no React, no "use server")
// so it's safe to import from either side.

/** Strips protocol, path, query, and a leading "www.", and lowercases. */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/^www\./, "");
  return value;
}

// Good enough to catch typos/empty input without rejecting real-world
// oddities (multi-level ccTLDs, punycode, etc). Not meant to be a strict
// RFC validator - the DataForSEO client treats "domain" as an opaque
// string anyway.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}
