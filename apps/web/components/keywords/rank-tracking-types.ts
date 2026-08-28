// Full rewrite for the Rank Tracking rebuild - every field's shape changed
// from the old version (location moved off the keyword and onto project-wide
// settings, metrics are nullable cached columns instead of a live-fetched
// non-null object, and history became "latest two snapshots" instead of a
// flat array now that the portfolio-wide trend lives in the position chart
// instead of per-row).

export type TrackedKeyword = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  metricsFetchedAt: string | null;
  currentPosition: number | null;
  currentUrl: string | null;
  previousPosition: number | null;
  serpFeatures: string[];
  checkedAt: string | null;
  addedAt: string;
  // True when the current snapshot is DataForSEO's deterministic fallback
  // (unconfigured or a failed real call), not a genuine Google position -
  // see keyword_rankings.is_mock. Never render this position as real
  // without surfacing this flag somewhere.
  isMock: boolean;
};

export type RankTrackingSettings = {
  locationCode: number;
  locationName: string;
  device: "desktop" | "mobile";
  scheduleInterval: "manual" | "weekly";
};

export type RankCheckRunStatus = "pending" | "running" | "completed" | "failed";

export type RankCheckRunProgress = {
  status: RankCheckRunStatus;
  keywordsTotal: number;
  keywordsChecked: number;
  errorMessage: string | null;
};
