"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { SeriesSpec } from "./trend-chart";

type ChartDatum = Record<string, string | number>;

const MAX_LABEL_CHARS = 13;

/** ChartContainer sets `overflow-visible` on the SVG surface (so rounded bar caps/tooltips at the edge aren't clipped) — a category label longer than the allotted axis width would otherwise bleed out past the card instead of just getting cut off, so it's truncated here before Recharts ever lays it out. The full value still shows on hover via ChartTooltipContent, which reads the untruncated data. */
function truncateLabel(value: string) {
  return value.length > MAX_LABEL_CHARS ? `${value.slice(0, MAX_LABEL_CHARS - 1)}…` : value;
}

/** Horizontal bar chart for categorical breakdowns (by subreddit, by collaborator) — one or more series grouped per category. */
export function CategoryBarChart({
  data,
  series,
  categoryKey = "label",
}: {
  data: ChartDatum[];
  series: SeriesSpec[];
  categoryKey?: string;
}) {
  const chartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.name, color: s.color }])) as ChartConfig;

  if (data.length === 0) return null;

  return (
    <ChartContainer config={chartConfig}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeOpacity={0.5} />
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, max) * 1.15]} />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tickLine={false}
          axisLine={false}
          width={92}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickFormatter={truncateLabel}
        />
        <ChartTooltip cursor={{ fill: "var(--color-muted)", opacity: 0.3 }} content={<ChartTooltipContent />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={20} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
