// Shared "last N days" range math (GA Insights, Dashboard's GA card, etc).
// GSC uses its own adaptive fetchGscExactWindow() (see gsc-fetch.ts) instead
// of this, since Search Console's real reporting lag isn't a fixed number
// of days and needs to be discovered from the real response, not guessed
// here - this plain version is for GA4, which doesn't have that problem.
//
// `days` is inclusive of both ends: a request for `days=28` must return a
// window spanning exactly 28 calendar dates, not 29 - `end - (days - 1)`,
// not `end - days`, is what makes that true (confirmed live: the naive
// `end - days` version was producing a 29-day window).
export function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: isoDate(start), end: isoDate(end) };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
