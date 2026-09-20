"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/ui";
import { cx } from "@/lib/cx";
import { ScheduledPostRow } from "./scheduled-post-row";
import type { ScheduledPost } from "./types";

/** Collapsed by default — a week is just a header until clicked, so the page opens on a scannable list of weeks, not a wall of posts. */
export function ScheduleWeekGroup({
  heading,
  rangeLabel,
  posts,
  companyNameById,
  accountNameById,
  formatTagLabelById,
  showCompany,
  onSelectPost,
}: {
  heading: string;
  rangeLabel: string;
  posts: ScheduledPost[];
  companyNameById: Record<string, string>;
  accountNameById: Record<string, string>;
  formatTagLabelById: Record<string, string>;
  /** Show the company tag on each row — only useful when the list isn't already filtered to one company. */
  showCompany: boolean;
  onSelectPost: (post: ScheduledPost) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const targetCount = posts.filter((p) => p.post_kind === "target").length;
  const genericCount = posts.length - targetCount;
  const postedCount = posts.filter((p) => p.is_posted).length;

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 text-left shadow-xs transition-colors hover:bg-secondary/60"
      >
        <ChevronRight
          className={cx("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-90")}
        />
        <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-base font-semibold text-foreground">{heading}</h2>
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          {targetCount > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {targetCount} target
            </span>
          )}
          {genericCount > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {genericCount} generic
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProgressBar value={postedCount} max={posts.length} className="w-12" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {postedCount}/{posts.length}
          </span>
        </div>
      </button>

      <div className={cx("grid transition-[grid-template-rows] duration-300 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="mt-3 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
            {posts.map((post) => (
              <ScheduledPostRow
                key={post.id}
                post={post}
                accountNameById={accountNameById}
                companyNameById={companyNameById}
                formatTagLabelById={formatTagLabelById}
                showCompany={showCompany}
                onClick={() => onSelectPost(post)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
