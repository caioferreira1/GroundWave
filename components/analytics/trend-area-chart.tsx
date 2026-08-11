import type { DateCount } from "@/lib/analytics/types";
import { TrendChart } from "./trend-chart";

/** Single-series area chart — e.g. "Posts posted over time". */
export function TrendAreaChart({ data, color, name }: { data: DateCount[]; color: string; name: string }) {
  return <TrendChart data={data} series={[{ key: "count", name, color }]} />;
}
