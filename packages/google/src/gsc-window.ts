import { getSearchConsolePerformance, getSearchConsoleQueryPageBreakdown } from "./data";
import type { SearchConsoleRow } from "./types";

// GSC's real reporting lag isn't a fixed number of days - it varies (and
// drifts) by property and by day, so hardcoding "3 days behind" (or any
// other fixed guess) will periodically be wrong in either direction: too
// aggressive and the window starts a day later than it needed to (fewer
// real days shown than requested, still labeled as if it were a full
// window); too conservative and it clips real available days off the
// front. Confirmed live once: a 3-day guess was one day too aggressive for
// one real property (real data was available through 2 days ago, not 3).
//
// Fix: don't guess. Request a window wide enough to comfortably cover any
// real lag, then trim to the most recent `days` rows Google actually
// returned. The `start`/`end` reported back are the REAL dates of that
// trimmed window (not the requested wide window), so a caller asking for
// 28 days and a caller reading the result's `start`/`end` can never
// disagree about what "last 28 days" actually covered.
//
// Lives here (not apps/web) so both the web app and the worker (Site
// Audit's cannibalization check) import the exact same implementation -
// no Next.js-specific dependency, just @rosterseo/google + date math.
const WIDE_WINDOW_BUFFER_DAYS = 10;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface GscExactWindowResult {
  dailyRows: SearchConsoleRow[];
  queryPageRows: SearchConsoleRow[];
  start: string | null;
  end: string | null;
}

export async function fetchGscExactWindow(accessToken: string, propertyUrl: string, days: number): Promise<GscExactWindowResult> {
  const wideEnd = new Date();
  const wideStart = new Date(wideEnd);
  wideStart.setDate(wideStart.getDate() - (days + WIDE_WINDOW_BUFFER_DAYS - 1));

  const wideRows = await getSearchConsolePerformance(accessToken, propertyUrl, isoDate(wideStart), isoDate(wideEnd));
  const sorted = [...wideRows].sort((a, b) => a.date.localeCompare(b.date));
  const dailyRows = sorted.slice(-days);

  const start = dailyRows.length > 0 ? dailyRows[0]!.date : null;
  const end = dailyRows.length > 0 ? dailyRows[dailyRows.length - 1]!.date : null;

  const queryPageRows = start && end ? await getSearchConsoleQueryPageBreakdown(accessToken, propertyUrl, start, end) : [];

  return { dailyRows, queryPageRows, start, end };
}
