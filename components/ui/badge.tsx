import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const badgeVariants = {
  neutral: "bg-secondary text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
  good: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  critical: "bg-destructive/10 text-destructive",
};

const dotVariants = {
  neutral: "bg-muted-foreground",
  accent: "bg-primary",
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

export function Badge({
  variant = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof badgeVariants;
  dot?: boolean;
  /** Adds a "live" ping ring to the dot — for states that are actively happening (e.g. ingestion running), not just true/false facts. */
  pulse?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        badgeVariants[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cx(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dotVariants[variant],
              )}
            />
          )}
          <span className={cx("relative inline-flex h-1.5 w-1.5 rounded-full", dotVariants[variant])} />
        </span>
      )}
      {children}
    </span>
  );
}
