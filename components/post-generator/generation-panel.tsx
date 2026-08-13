"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui";
import { GenerateButton } from "./generate-button";

/**
 * Owns the generate Server Action + pending state, and swaps the output
 * region for an animated "AI is generating" placeholder while it runs —
 * `children` is the server-rendered result (featured card + history, or the
 * empty state), which reappears once the action's `revalidatePath` refreshes
 * the page.
 */
export function GenerationPanel({
  action,
  hasFeatured,
  children,
}: {
  action: () => Promise<void>;
  hasFeatured: boolean;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      try {
        await action();
        toast.success("Post generated!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate post.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <GenerateButton onClick={handleGenerate} pending={isPending} hasFeatured={hasFeatured} />
      {isPending ? <GeneratingCard /> : children}
    </div>
  );
}

function GeneratingCard() {
  return (
    <div
      className="animate-border-flow rounded-lg p-px"
      style={{
        backgroundImage: "linear-gradient(90deg, var(--color-primary), var(--color-chart-2), var(--color-primary))",
        backgroundSize: "200% 100%",
      }}
    >
      <div className="space-y-4 rounded-[7px] bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2 rounded-md bg-secondary p-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <p className="flex items-center gap-2 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" strokeWidth={2} />
          AI is drafting your post…
        </p>
      </div>
    </div>
  );
}
