import { cx } from "@/lib/cx";

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span className={cx("inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-secondary", className)}>
      <span className="block h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${pct}%` }} />
    </span>
  );
}
