import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";

export function ChartCard({
  title,
  description,
  isEmpty,
  emptyDescription,
  legend,
  children,
}: {
  title: string;
  description?: string;
  isEmpty: boolean;
  emptyDescription?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {legend && !isEmpty && <div className="pb-1">{legend}</div>}
        <div className="h-64">
          {isEmpty ? (
            <EmptyState
              icon={BarChart3}
              title="No data yet"
              description={emptyDescription ?? "Nothing to show for this period."}
            />
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}
