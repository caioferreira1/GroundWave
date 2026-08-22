"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui";
import { GenerateButton } from "./generate-button";
import { PostGenerationList } from "./post-generation-list";
import type { PostGenerationActions, PostGenerationRow } from "./types";

/**
 * Owns the generate Server Action + pending state, and swaps the post list
 * for an animated "AI is generating" placeholder while it runs. Also owns
 * `justGeneratedId` — the only thing that distinguishes the freshly
 * generated post from the rest of the list (it starts expanded and
 * highlighted). That id lives in this component's state, so it resets to
 * null on remount: navigate away and back and every post, including the
 * newest one, looks the same as the others.
 */
export function GenerationPanel({
  action,
  posts,
  deleteAction,
  actions,
  emptyState,
}: {
  action: () => Promise<{ id: string }>;
  posts: PostGenerationRow[];
  deleteAction: (id: string) => Promise<void>;
  actions?: PostGenerationActions;
  emptyState: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [justGeneratedId, setJustGeneratedId] = useState<string | null>(null);

  function handleGenerate() {
    startTransition(async () => {
      try {
        const result = await action();
        setJustGeneratedId(result.id);
        toast.success("Post generated!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate post.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <GenerateButton onClick={handleGenerate} pending={isPending} hasFeatured={posts.length > 0} />
      {isPending ? (
        <GeneratingCard />
      ) : posts.length > 0 ? (
        <PostGenerationList posts={posts} justGeneratedId={justGeneratedId} deleteAction={deleteAction} actions={actions} />
      ) : (
        emptyState
      )}
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
