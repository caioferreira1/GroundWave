import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Card } from "./card";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Card interactive className={cx("p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
        <span className="bg-accent flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white">
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        {label}
      </div>
      <div className="mt-2.5">{value}</div>
      {hint}
    </Card>
  );
}
