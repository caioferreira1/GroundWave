"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";
import { isoWeekKey } from "@/lib/analytics/bucket";
import { useIsAnimationEnabled } from "./reduced-motion";

export type SeriesSpec = { key: string; name: string; color: string };
type ChartDatum = Record<string, string | number>;

const VIEW_W = 600;
const VIEW_H = 220;
const TOP_PAD = 14;
/** Dash pattern length must divide the `dash-flow` keyframe's -0.24 offset for a seamless loop. */
const FLOW_DASH = "0.04 0.08";

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

function pathD(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function areaPathD(top: { x: number; y: number }[], base: { x: number; y: number }[]) {
  const forward = pathD(top);
  const backward = [...base]
    .reverse()
    .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  return `${forward} ${backward} Z`;
}

/**
 * Hand-built SVG line/area chart — replaces Recharts for the trend charts so
 * the line can carry the brand gradient, draw itself in on mount, and run a
 * "flowing data" dashed overlay (the "AI is live" read), plus a hover
 * crosshair + tooltip. Coordinates live in a fixed abstract viewBox and
 * `preserveAspectRatio="none"` stretches it to the container, so hover math
 * only needs the pointer's fraction across the container width — no
 * ResizeObserver needed.
 *
 * `stacked` sums each series onto the previous one (matching Recharts'
 * `stackId` behavior) — only meaningful when the series are additive parts
 * of a real total.
 *
 * `glow` adds a soft blurred halo behind each line (feGaussianBlur +
 * feComposite, same technique as shadcn's "glowing line chart" recipe) for
 * charts that should read as more alive/emphasized than the default.
 */
export function TrendChart({
  data: rawData,
  series,
  stacked = false,
  xKey = "date",
  glow = false,
}: {
  data: ChartDatum[];
  series: SeriesSpec[];
  stacked?: boolean;
  xKey?: string;
  glow?: boolean;
}) {
  const animate = useIsAnimationEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const glowFilterId = `${useId().replace(/:/g, "")}-trend-glow`;

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

  const n = data.length;
  const isSingleSeries = series.length === 1;
  const currentWeekIndex = useMemo(() => {
    const currentWeek = isoWeekKey(new Date());
    return data.findIndex((d) => String(d[xKey]) === currentWeek);
  }, [data, xKey]);

  const { linePoints, areaPoints, yMaxRaw, xAt } = useMemo(() => {
    const xAt = (i: number) => (n <= 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W);

    let running = new Array(n).fill(0);
    const tops: number[][] = [];
    const bases: number[][] = [];
    const rawValues: number[][] = [];

    for (const s of series) {
      const values = data.map((d) => Number(d[s.key]) || 0);
      rawValues.push(values);
      const base = stacked ? [...running] : new Array(n).fill(0);
      running = stacked ? running.map((r, i) => r + values[i]) : running;
      bases.push(base);
      tops.push(stacked ? [...running] : values);
    }

    const yMaxRaw = Math.max(1, ...tops.flat());
    const yMax = yMaxRaw * 1.15;
    const yAt = (v: number) => TOP_PAD + (1 - v / yMax) * (VIEW_H - TOP_PAD);

    const linePoints = series.map((_, si) =>
      tops[si].map((v, i) => ({ x: xAt(i), y: yAt(v), value: rawValues[si][i] })),
    );
    const areaPoints = series.map((_, si) => ({
      top: tops[si].map((v, i) => ({ x: xAt(i), y: yAt(v) })),
      base: bases[si].map((v, i) => ({ x: xAt(i), y: yAt(v) })),
    }));

    return { linePoints, areaPoints, yMaxRaw, xAt };
  }, [data, series, stacked, n]);

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(fraction * (n - 1)));
  }

  if (n === 0) return null;

  const hoverFraction = hoverIndex !== null ? xAt(hoverIndex) / VIEW_W : null;
  const tooltipAlign = hoverFraction === null ? "center" : hoverFraction < 0.2 ? "start" : hoverFraction > 0.8 ? "end" : "center";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <span className="pointer-events-none absolute top-0 left-0 text-[10px] font-medium text-ink-muted">
        {Math.ceil(yMaxRaw).toLocaleString()}
      </span>
      <span className="pointer-events-none absolute bottom-5 left-0 text-[10px] font-medium text-ink-muted">0</span>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-[calc(100%-1.25rem)] w-full"
        aria-hidden="true"
      >
        <defs>
          {isSingleSeries && (
            <linearGradient id="trend-line-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="100%" stopColor="var(--color-glow-cyan)" />
            </linearGradient>
          )}
          {series.map((s) => (
            <linearGradient key={s.key} id={`trend-area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
          {glow && (
            <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          )}
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={VIEW_W}
            y1={TOP_PAD + f * (VIEW_H - TOP_PAD)}
            y2={TOP_PAD + f * (VIEW_H - TOP_PAD)}
            stroke="var(--color-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {series.map((s, si) => (
          <path key={`area-${s.key}`} d={areaPathD(areaPoints[si].top, areaPoints[si].base)} fill={`url(#trend-area-${s.key})`} />
        ))}

        {series.map((s, si) => {
          const stroke = isSingleSeries ? "url(#trend-line-gradient)" : s.color;
          return (
            <g key={`line-${s.key}`}>
              <path
                d={pathD(linePoints[si])}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pathLength={1}
                strokeDasharray={animate ? 1 : undefined}
                className={animate ? "animate-draw-in" : undefined}
                filter={glow ? `url(#${glowFilterId})` : undefined}
              />
              {animate && (
                <path
                  d={pathD(linePoints[si])}
                  fill="none"
                  stroke={isSingleSeries ? "var(--color-glow-cyan)" : s.color}
                  strokeOpacity={0.6}
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray={FLOW_DASH}
                  className="animate-dash-flow"
                />
              )}
            </g>
          );
        })}

        {hoverIndex !== null && (
          <>
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={TOP_PAD}
              y2={VIEW_H}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {linePoints.map((pts, si) => (
              <circle
                key={`dot-${series[si].key}`}
                cx={pts[hoverIndex].x}
                cy={pts[hoverIndex].y}
                r={4}
                fill={series[si].color}
                stroke="var(--color-surface)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        )}

        {linePoints.map((pts, si) => {
          const last = pts[pts.length - 1];
          return (
            <circle
              key={`end-${series[si].key}`}
              cx={last.x}
              cy={last.y}
              r={4}
              fill={series[si].color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {currentWeekIndex >= 0 && (
          <line
            x1={xAt(currentWeekIndex)}
            x2={xAt(currentWeekIndex)}
            y1={TOP_PAD}
            y2={VIEW_H}
            stroke="var(--color-accent)"
            strokeOpacity={0.4}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {currentWeekIndex >= 0 && (
        <span
          className="pointer-events-none absolute top-0 z-[5] -translate-x-1/2 text-[10px] font-semibold text-accent"
          style={{ left: `${(xAt(currentWeekIndex) / VIEW_W) * 100}%` }}
        >
          Now
        </span>
      )}

      <div className="mt-1 flex items-center justify-between text-[10px] font-medium text-ink-muted">
        <span>{formatWeekLabel(String(data[0][xKey]))}</span>
        {n > 2 && <span>{formatWeekLabel(String(data[Math.floor((n - 1) / 2)][xKey]))}</span>}
        {n > 1 && <span>{formatWeekLabel(String(data[n - 1][xKey]))}</span>}
      </div>

      {hoverIndex !== null && hoverFraction !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-y-1 rounded-lg border border-border bg-surface p-2.5 text-xs shadow-md"
          style={{
            left: `${hoverFraction * 100}%`,
            transform: tooltipAlign === "start" ? "translateX(0)" : tooltipAlign === "end" ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          <p className="mb-1 text-ink-muted">{formatWeekLabelFull(String(data[hoverIndex][xKey]))}</p>
          <div className="space-y-0.5">
            {series.map((s, si) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-ink-muted">{s.name}:</span>
                <span className="font-mono font-medium text-ink">{linePoints[si][hoverIndex].value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
