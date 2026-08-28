// The shared GSC/GA4/Bing/Merchant summarizers (gsc-insights-metrics.ts,
// ga-insights-metrics.ts, etc.) compare the second half of whatever rows
// they're given against the first half, and label the delta with that
// half's real length - e.g. "+55% vs prior 14d" for a 28-day fetch. On the
// Insights pages that's useful context. On the Dashboard, each card's own
// footer already states the window ("· last 28 days"), so repeating it
// next to every single delta is redundant - this strips the "vs prior Xd"
// suffix entirely, leaving just the trend ("+55%"). The `days` param is
// unused now (kept so call sites don't need to change) - the underlying
// comparison itself is untouched, only the label text.
export function relabelWindow(label: string, _days: number): string {
  return label.replace(/\s*vs prior \d+d$/, "");
}
