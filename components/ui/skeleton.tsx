import { cx } from "@/lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-md bg-surface-muted", className)}>
      <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}
