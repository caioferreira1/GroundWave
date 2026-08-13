"use client";

import { createContext, useContext, useId, type ComponentProps, type ReactElement } from "react";
import { ResponsiveContainer, Tooltip } from "recharts";
import { cx } from "@/lib/cx";

export type ChartConfig = Record<string, { label: string; color?: string }>;

const ChartContext = createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error("Chart components must be rendered within a ChartContainer");
  return ctx;
}

/** Wraps Recharts' ResponsiveContainer and exposes each series' color as a `--color-{key}` CSS var. */
export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: ReactElement;
}) {
  const id = `chart-${useId().replace(/:/g, "")}`;
  const vars = Object.entries(config)
    .filter(([, c]) => c.color)
    .map(([key, c]) => `--color-${key}: ${c.color};`)
    .join(" ");

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-chart={id} className={cx("h-full w-full [&_.recharts-surface]:overflow-visible", className)}>
        {vars && <style dangerouslySetInnerHTML={{ __html: `[data-chart="${id}"] { ${vars} }` }} />}
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export function ChartTooltip(props: ComponentProps<typeof Tooltip>) {
  return <Tooltip {...props} />;
}

type TooltipEntry = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string };

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  labelFormatter?: (value: string) => string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">
        {labelFormatter ? labelFormatter(String(label)) : String(label)}
      </p>
      <div className="space-y-0.5">
        {payload.map((item) => (
          <div key={String(item.dataKey ?? item.name)} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{config[String(item.dataKey)]?.label ?? item.name}:</span>
            <span className="font-mono font-medium text-foreground tabular-nums">
              {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
