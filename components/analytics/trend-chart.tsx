"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { isoWeekKey } from "@/lib/analytics/bucket";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type SeriesSpec = { key: string; name: string; color: string };
type ChartDatum = Record<string, string | number>;

/** `x[key]` values are ISO week keys ("2026-W33") — "W33" for axis ticks. */
function formatWeekLabel(value: string) {
  const match = /-W(\d{2})$/.exec(value);
  return match ? `W${match[1]}` : value;
}

/** "Week 33" for the tooltip and the "current week" marker. */
function formatWeekLabelFull(value: string) {
  const match = /-W(\d{2})$/.exec(value);
  return match ? `Week ${Number(match[1])}` : value;
}

export function TrendChart({
  data: rawData,
  series,
  stacked = false,
  xKey = "date",
}: {
  data: ChartDatum[];
  series: SeriesSpec[];
  stacked?: boolean;
  xKey?: string;
}) {
  // Drop the leading run of all-zero weeks. The lookback window is a fixed
  // N weeks ending on the current week, so a company/feature that only
  // recently started producing data shows a long dead-flat prefix before
  // anything real happened — cut straight to the first active week instead.
  // (All-zero across the whole window is a different case, handled upstream
  // by ChartCard's `isEmpty`.) The window also carries a few weeks *past*
  // the current one (zero-filled runway that fills in as those weeks
  // happen), so trailing zeros are left alone — the `currentWeekIndex`
  // marker below is what tells those apart from "no data".
  const data = useMemo(() => {
    const firstActive = rawData.findIndex((d) => series.some((s) => (Number(d[s.key]) || 0) !== 0));
    return firstActive > 0 ? rawData.slice(firstActive) : rawData;
  }, [rawData, series]);

  const currentWeekIndex = useMemo(() => {
    const currentWeek = isoWeekKey(new Date());
    return data.findIndex((d) => String(d[xKey]) === currentWeek);
  }, [data, xKey]);

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map((s) => [s.key, { label: s.name, color: s.color }])),
    [series],
  );

  if (data.length === 0) return null;

  return (
    <ChartContainer config={chartConfig}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatWeekLabel}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis hide domain={[0, (max: number) => Math.max(1, max) * 1.15]} />
        <ChartTooltip
          cursor={{ stroke: "var(--color-border)", strokeDasharray: "3 3" }}
          content={<ChartTooltipContent labelFormatter={formatWeekLabelFull} />}
        />
        {currentWeekIndex >= 0 && (
          <ReferenceLine
            x={String(data[currentWeekIndex][xKey])}
            stroke="var(--color-primary)"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
            label={{ value: "Now", position: "top", fontSize: 10, fontWeight: 600, fill: "var(--color-primary)" }}
          />
        )}
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.name}
            type="monotone"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.08}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            stackId={stacked ? "stack" : undefined}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}
