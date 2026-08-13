"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { Card } from "./card";

export function CompanyCard({
  id,
  name,
  websiteUrl,
  ingestionEnabled,
}: {
  id: string;
  name: string;
  websiteUrl: string | null;
  ingestionEnabled: boolean;
}) {
  const router = useRouter();
  const href = `/companies/${id}`;

  function goToCompany() {
    router.push(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToCompany();
    }
  }

  return (
    <Card
      interactive
      role="link"
      tabIndex={0}
      onClick={goToCompany}
      onKeyDown={onKeyDown}
      className="flex cursor-pointer items-start gap-3 p-4"
    >
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e: MouseEvent) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Link
          </a>
        )}
        <div className="mt-2.5">
          <Badge variant={ingestionEnabled ? "good" : "neutral"} dot pulse={ingestionEnabled}>
            {ingestionEnabled ? "Ingestion on" : "Ingestion off"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
