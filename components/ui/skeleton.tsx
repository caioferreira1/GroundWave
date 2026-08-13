import { cx } from "@/lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-md bg-muted", className)}>
      <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  );
}
