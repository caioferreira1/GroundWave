import type { DateCount } from "./types";

/**
 * Bucketing is done in UTC calendar weeks (ISO 8601: Monday start, week 1 is
 * the week containing Jan 4th) — nothing else in the app handles user
 * timezone (timestamptz columns are stored/read in UTC throughout), so this
 * matches the rest of the codebase rather than solving timezone display
 * here. Known v1 limitation: an event late Sunday local / past midnight UTC
 * Monday can land in "next week"'s bucket.
 *
 * The window intentionally extends past today into a few future weeks,
 * zero-filled — a fixed backward-only lookback made brand-new companies
 * look like a long dead flat line before any real activity, so instead the
 * chart now starts at the first active week and carries a few weeks of
 * "runway" ahead that fills in as real weeks happen. `TrendChart` marks the
 * boundary between the two with a "current week" reference line.
 */

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday (UTC midnight) of the ISO week containing `d`. */
function isoWeekStart(d: Date): Date {
  const date = toUtcMidnight(d);
  const day = date.getUTCDay() || 7; // Sunday (0) -> 7, so Monday is always day 1
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
}

/** ISO 8601 week key `YYYY-Www` (e.g. "2026-W33") — sortable, unique across years. */
export function isoWeekKey(d: Date): string {
  const monday = isoWeekStart(d);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = isoWeekStart(jan4);
  const weekNumber = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

/** `pastWeeks` (including the current one) trailing + `futureWeeks` upcoming ISO week keys, in order. */
export function buildWeekRange(pastWeeks: number, futureWeeks: number): string[] {
  const currentMonday = isoWeekStart(new Date());
  const keys: string[] = [];
  for (let i = -(pastWeeks - 1); i <= futureWeeks; i++) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(currentMonday.getUTCDate() + i * 7);
    keys.push(isoWeekKey(monday));
  }
  return keys;
}

/** UTC-midnight ISO timestamp at the start of the Monday `pastWeeks - 1` weeks ago — the query-side window start. */
export function weekWindowStartIso(pastWeeks: number): string {
  const currentMonday = isoWeekStart(new Date());
  const start = new Date(currentMonday);
  start.setUTCDate(currentMonday.getUTCDate() - (pastWeeks - 1) * 7);
  return start.toISOString();
}

/** Gap-filled per-week counts — zero for buckets with no matching timestamp. */
export function countByWeek(timestamps: (string | null)[], pastWeeks: number, futureWeeks: number): DateCount[] {
  const buckets = new Map(buildWeekRange(pastWeeks, futureWeeks).map((key) => [key, 0]));
  for (const iso of timestamps) {
    if (!iso) continue;
    const key = isoWeekKey(new Date(iso));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/** Gap-filled per-week sums — skips rows with a null date or value. */
export function sumByWeek(
  rows: { date: string | null; value: number | null }[],
  pastWeeks: number,
  futureWeeks: number,
): { date: string; value: number }[] {
  const buckets = new Map(buildWeekRange(pastWeeks, futureWeeks).map((key) => [key, 0]));
  for (const row of rows) {
    if (!row.date || row.value == null) continue;
    const key = isoWeekKey(new Date(row.date));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.value);
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}
