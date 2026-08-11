"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Badge, Card, CopyButton, buttonClass } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { PostGenerationRow } from "./types";

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HistoryList({
  posts,
  deleteAction,
}: {
  posts: PostGenerationRow[];
  deleteAction: (id: string) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (posts.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink-muted">Previous posts</p>
      {posts.map((post) => {
        const expanded = expandedId === post.id;
        return (
          <Card key={post.id} className="p-4">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : post.id)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral" className="font-mono">
                    r/{post.subreddit}
                  </Badge>
                  <Badge variant="accent" className="capitalize">
                    {post.theme}
                  </Badge>
                  {post.persona_display_name && <Badge variant="good">{post.persona_display_name}</Badge>}
                  <span className="text-xs text-ink-muted">{formatRelativeDate(post.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-ink">{post.title}</p>
                {!expanded && <p className="line-clamp-2 text-xs text-ink-muted">{post.body}</p>}
              </div>
              <ChevronDown
                className={cx(
                  "h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150",
                  expanded && "rotate-180",
                )}
                strokeWidth={2}
              />
            </button>

            {expanded && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <p className="text-sm whitespace-pre-wrap text-ink-muted">{post.body}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton value={post.title} label="Copy Title" />
                  <CopyButton value={post.body} label="Copy Body" />
                  <form action={deleteAction.bind(null, post.id)} className="ml-auto">
                    <button
                      type="submit"
                      className={cx(buttonClass("ghost", "sm"), "text-ink-muted hover:text-critical")}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
