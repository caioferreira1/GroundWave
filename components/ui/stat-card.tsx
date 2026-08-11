import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
        <span className="bg-gradient-brand flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white">
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        {label}
      </div>
      <div className="mt-2.5">{value}</div>
      {hint}
    </Card>
  );
}
