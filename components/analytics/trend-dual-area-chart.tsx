import { TrendChart, type SeriesSpec } from "./trend-chart";

/**
 * Two-series area chart. `stacked` should only be true when the two series
 * are additive parts of a real total (e.g. views from posts + views from
 * comments) — for series that overlap in time without summing to a
 * meaningful total (e.g. "generated" vs "posted" counts, where posted is a
 * subset of generated), leave unstacked so the two areas overlay instead of
 * distorting a fake combined total.
 */
export function TrendDualAreaChart({
  data,
  series,
  stacked = false,
}: {
  data: Record<string, string | number>[];
  series: [SeriesSpec, SeriesSpec];
  stacked?: boolean;
}) {
  return <TrendChart data={data} series={series} stacked={stacked} />;
}
