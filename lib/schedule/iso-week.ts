/**
 * ISO-8601 week-of-year math, UTC-based to match lib/activity/rotation.ts's
 * isoWeekday() convention (Monday = 1 .. Sunday = 7). No date library in
 * this app — these are the few primitives the Schedule feature needs:
 * classify a Date into {isoYear, isoWeek}, get a week's Monday-Sunday range
 * for display, and convert to/from the native <input type="week"> string
 * format ("2026-W38"), so the create/edit forms need no custom week picker.
 */

export type IsoWeek = { isoYear: number; isoWeek: number };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Classifies any Date into its ISO year + ISO week number (the Thursday-of-the-week trick). */
export function getIsoWeek(date: Date): IsoWeek {
  const d = startOfUtcDay(date);
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to this week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil((((d.getTime() - yearStart) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

/** Monday 00:00 UTC through Sunday of that ISO week. */
export function getIsoWeekDateRange(isoYear: number, isoWeek: number): { start: Date; end: Date } {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)); // always falls in week 1
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

/** "Sep 14-20, 2026" / "Sep 28 - Oct 4, 2026" across a month boundary. */
export function formatWeekRangeLabel(isoYear: number, isoWeek: number): string {
  const { start, end } = getIsoWeekDateRange(isoYear, isoWeek);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const monthDay = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  const dayOnly = (d: Date) => new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(d);

  const startLabel = monthDay(start);
  const endLabel = sameMonth ? dayOnly(end) : monthDay(end);
  return `${startLabel}–${endLabel}, ${end.getUTCFullYear()}`;
}

/** Parses an <input type="week"> value ("2026-W38"). Returns null on anything malformed. */
export function parseWeekInputValue(value: string): IsoWeek | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (isoWeek < 1 || isoWeek > 53) return null;
  return { isoYear, isoWeek };
}

/** Inverse of parseWeekInputValue - for defaultValue on the <input type="week">. */
export function formatWeekInputValue(isoYear: number, isoWeek: number): string {
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}
