export type KeywordSearchHistoryEntry = {
  id: string;
  seedKeyword: string;
  locationCode: number;
  locationName: string;
  resultCount: number;
  createdAt: string;
};

export type KeywordCountryOption = {
  code: number;
  isoCode: string;
  name: string;
};

// "related" = Google's real "searches related to" matches (closest to the
// seed), "suggestion" = real substring variations of the seed itself,
// "idea" = broader same-category matches, only fetched as a third tier
// when the first two together come back thin. Results are ordered by
// tier by default (related first) so "similar first, then variations"
// is a real ordering, not just a label.
export type KeywordResultSource = "related" | "suggestion" | "idea";

export type SourcedKeywordMetrics = import("@seo-tool/dataforseo").KeywordMetrics & { source: KeywordResultSource };
