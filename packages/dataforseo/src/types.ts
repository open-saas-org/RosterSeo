export type KeywordMetrics = {
  keyword: string;
  searchVolume: number;
  difficulty: number; // 0-100, organic SEO difficulty
  cpc: number;
  competition: number | null; // 0-1, paid/ads competition - a distinct DataForSEO metric from difficulty; null when DataForSEO doesn't report a value for this keyword (never fabricated as 0, which is a real "zero competition" answer)
  trend: number[]; // last 12 months, absolute search volume
  intent: string | null; // e.g. "commercial", "informational", "transactional", "navigational"
};

export type SerpResult = {
  position: number;
  url: string;
  domain: string;
  title: string;
};

export type RankCheckResult = {
  position: number | null; // null = domain not found in top 10 organic results
  url: string | null;
  serpFeatures: string[]; // e.g. "PAA", "Featured Snippet", "Local Pack" - every non-organic block seen on the SERP, not just ones the domain owns
};

export type DomainOverview = {
  domain: string;
  estimatedMonthlyTraffic: number;
  organicKeywords: number;
  topPages: { url: string; traffic: number }[];
};

export type BacklinksOverview = {
  domain: string;
  totalBacklinks: number;
  referringDomains: number;
  domainRating: number; // 0-100
};

export type BacklinkItem = {
  domainFrom: string;
  urlFrom: string;
  urlTo: string;
  anchor: string | null;
  dofollow: boolean;
  domainFromRank: number; // 0-1000, DataForSEO's own referring-domain rank
  spamScore: number; // 0-100, higher = more likely spammy/low-quality
  firstSeen: string | null; // ISO date
  lastSeen: string | null; // ISO date
  isNew: boolean;
  isLost: boolean;
};

export type LocalPackResult = {
  position: number;
  businessName: string;
  rating: number;
  reviewCount: number;
};

// Real Google Maps listing data for a business search - used to let a user
// find and pick their own real business (name, address, coordinates) for
// Local SEO's Business Profile without needing a Google Business Profile
// OAuth connection at all (see business-profile.mdx / ManualLocationForm).
export type MapsBusinessResult = {
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number;
  category: string | null;
  placeId: string | null;
};

// One node in DataForSEO's real State/City location hierarchy (the
// canonical, always-valid set of location_code values - see
// listLocationStates/Cities). `code` is what searchMapsBusinesses sends
// straight to DataForSEO; `name` is just for display.
export type LocationOption = {
  code: number;
  name: string;
};

// Full real listing detail for one business, from DataForSEO's Business
// Data API (business_data/google/my_business_info/live) - everything
// Google Business Profile's own Business Information API would return,
// with no OAuth/approval needed. workTime/attributes are Google's own
// nested shapes, kept loosely-typed since they're only ever rendered
// defensively, not computed on.
export type BusinessListingDetails = {
  title: string;
  description: string | null;
  category: string | null;
  additionalCategories: string[];
  cid: string | null;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  totalPhotos: number;
  lat: number | null;
  lng: number | null;
  isClaimed: boolean;
  workTime: unknown;
  attributes: unknown;
  rating: number | null;
  reviewCount: number;
};

// Countries need one extra field states/cities don't: DataForSEO's
// per-country locations endpoint is keyed by ISO code in the URL path
// (/serp/google/locations/{isoCode}), NOT by the country's own numeric
// location_code - the two are unrelated identifiers for the same row.
// `code` (numeric) is still what gets sent to search if the user picks a
// country with no state/city; `isoCode` is only ever used to fetch that
// country's real states/cities.
export type CountryOption = {
  code: number;
  isoCode: string;
  name: string;
};
