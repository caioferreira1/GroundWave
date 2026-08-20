"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge, Button, Input } from "@/components/ui";

/**
 * Add-one-at-a-time chip list for the generic post generator's subreddit
 * pool — replaced an earlier one-per-line textarea, which was fiddly for
 * adding/removing a single entry.
 */
export function SubredditsManager({
  subreddits,
  addAction,
  removeAction,
}: {
  subreddits: string[];
  addAction: (subreddit: string) => Promise<void>;
  removeAction: (subreddit: string) => Promise<void>;
}) {
  const [isAdding, startAdd] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("subreddit") ?? "").trim();
    if (!value) return;

    startAdd(async () => {
      try {
        await addAction(value);
        form.reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add subreddit.");
      }
    });
  }

  function handleRemove(subreddit: string) {
    setRemoving(subreddit);
    startAdd(async () => {
      try {
        await removeAction(subreddit);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove subreddit.");
      } finally {
        setRemoving(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input name="subreddit" placeholder="e.g. travel" autoComplete="off" className="flex-1" />
        <Button type="submit" disabled={isAdding}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {subreddits.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {subreddits.map((s) => (
            <Badge key={s} className="gap-1 py-1 pr-1 pl-2.5">
              r/{s}
              <button
                type="button"
                onClick={() => handleRemove(s)}
                disabled={isAdding && removing === s}
                aria-label={`Remove r/${s}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No subreddits configured yet.</p>
      )}
    </div>
  );
}
