"use client";

import { useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui";
import type { ApifyAccountUsage } from "@/lib/reddit/apify";

type LastRun = { cost_usd: number; item_count: number; status: string } | null;

/**
 * Client wrapper around the "Run ingestion now" server action so a blocked
 * attempt (a run already in progress — see actions.ts::runIngestionNow) can
 * surface as a toast instead of the native form action's default error
 * overlay, or looking like the click did nothing.
 */
export function RunIngestionButton({
  action,
  lastRun,
  usage,
}: {
  action: () => Promise<void>;
  lastRun: LastRun;
  usage: ApifyAccountUsage | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start ingestion.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-end gap-1.5">
      <button type="submit" className={buttonClass("secondary", "sm")} disabled={isPending}>
        {isPending ? "Starting…" : "Run ingestion now"}
      </button>
      <p className="font-mono text-xs text-muted-foreground">
        {lastRun
          ? lastRun.status === "RUNNING"
            ? "Last run: in progress… · "
            : `Last run: $${lastRun.cost_usd.toFixed(2)} (${lastRun.item_count} posts) · `
          : ""}
        {usage
          ? `Apify: $${usage.spentUsd.toFixed(2)}${usage.limitUsd ? ` / $${usage.limitUsd.toFixed(2)}` : ""} this month`
          : "Apify usage unavailable"}
      </p>
    </form>
  );
}
