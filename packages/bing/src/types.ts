export interface BingSite {
  url: string;
}

export interface BingPerformanceRow {
  date: string; // ISO yyyy-mm-dd
  clicks: number;
  impressions: number;
  ctr: number;
  avgClickPosition: number;
}
