// Shared last-value-carried-forward (LVCF) trend smoothing. AI Visibility
// has no scheduler yet - every run is a manual, irregular event - so a raw
// day-by-day series (today's real value, or a bare 0/gap on days nothing
// ran) reads as a noisy sawtooth instead of a trend. Generalizes per-prompt
// cadence normalization into one pure function shared by every AI
// Visibility chart pipeline that needs it:
// citation-analysis.ts's buildDailySeries (category/page-type series),
// share-of-voice-dashboard.tsx's day-by-day Share of Voice % trend, and
// visibility-dashboard.tsx's computePromptChartData per-prompt/per-entity %
// trend - so all three produce trend lines with the exact same fill
// behavior instead of three slightly different ad hoc smoothings.

// A day with no real data for a given key is left out of that day's row
// entirely (not defaulted to 0) - fillLastValueCarriedForward below decides
// whether that's a genuine gap (nothing to carry forward yet) or something
// to carry forward from an earlier real day.
export type RawDailyValues<K extends string> = Partial<Record<K, number>>;

/**
 * Walks `range` (every date to emit one output row for, in ascending order)
 * against `raw` (only the dates that have a real value per key). For each
 * key in `keys`:
 *  - a date with a real value in `raw` uses that value, and becomes the new
 *    "last known" value for that key going forward;
 *  - a date with no real value carries forward the most recent earlier real
 *    value for that same key;
 *  - a date before that key's first real value is left unset on the output
 *    row (nothing exists yet to carry forward - not the same as a real 0).
 *
 * Each key is carried forward independently, so one entity/category having
 * a run today and another not doesn't zero out the one that didn't.
 */
export function fillLastValueCarriedForward<K extends string>(
  range: readonly string[],
  raw: ReadonlyMap<string, RawDailyValues<K>>,
  keys: readonly K[],
): Array<{ date: string } & RawDailyValues<K>> {
  const lastValue: Record<string, number> = {};
  return range.map((date) => {
    const dayValues = raw.get(date);
    const row: Record<string, string | number> = { date };
    for (const key of keys) {
      const real = dayValues?.[key];
      if (real !== undefined) {
        lastValue[key] = real;
        row[key] = real;
      } else if (lastValue[key] !== undefined) {
        row[key] = lastValue[key]!;
      }
    }
    return row as { date: string } & RawDailyValues<K>;
  });
}

/** Every calendar date from `days` ago through today, ascending, ISO yyyy-mm-dd. */
export function dailyDateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
