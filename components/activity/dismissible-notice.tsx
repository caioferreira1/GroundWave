"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui";
import { cx } from "@/lib/cx";

/**
 * A dismissible inline disclaimer badge — closes via local state only (no
 * persistence to daily_task_completions or anywhere else), so it reappears
 * on the next page load. Used for rotation exceptions the user can
 * acknowledge and choose to ignore without a server round-trip: a delayed
 * generic post, or a target post picked early via the 70% last-resort tier.
 */
export function DismissibleNotice({
  variant = "warning",
  children,
  className,
}: {
  variant?: "warning" | "accent";
  children: React.ReactNode;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Badge variant={variant} className={cx("w-fit gap-1 pr-1", className)}>
      {children}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full hover:bg-black/10"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </Badge>
  );
}
