import type { CompetitorSnapshot } from "@/app/(dashboard)/competitors/actions";

export type TrackedCompetitor = {
  id: string;
  domain: string;
  // Set from the AI Visibility side of this same tracked-competitor row -
  // name/aliases are how a report names a rival and how citation/AI-answer
  // matching recognizes sub-brand names; additionalDomains are other
  // domains this competitor owns (regional site, product line).
  name: string | null;
  aliases: string[] | null;
  additionalDomains: string[] | null;
  // "idle" = tracked but never scanned (or not scanned this session) - no
  // DataForSEO call happens until the user presses Scan. Nothing here
  // auto-fetches on page load or right after adding a competitor.
  status: "idle" | "loading" | "ready" | "error";
  snapshot?: CompetitorSnapshot;
  error?: string;
};
