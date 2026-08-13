import { cx } from "@/lib/cx";

/** A single ratio against a limit — same-ramp track (lighter step of the fill's own color), fill turns success once the target is met. */
export function Meter({
  label,
  done,
  target,
  className,
}: {
  label: string;
  done: number;
  target: number;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const met = target > 0 && done >= target;

  return (
    <div className={cx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums text-foreground">
          {done}/{target}
        </span>
      </div>
      <span className={cx("block h-1.5 w-full overflow-hidden rounded-full", met ? "bg-success/15" : "bg-primary/15")}>
        <span
          className={cx("block h-full rounded-full transition-all duration-200", met ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
