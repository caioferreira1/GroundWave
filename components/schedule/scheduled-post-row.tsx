"use client";

import { CheckCircle2, Clock3, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { cx } from "@/lib/cx";
import { POST_KIND_BADGE_VARIANT, POST_KIND_LABEL } from "./constants";
import type { ScheduledPost } from "./types";

/** One compact row — shared by the list view's week groups and the calendar view's expanded weeks, so both stay visually identical. */
export function ScheduledPostRow({
  post,
  accountNameById,
  companyNameById,
  formatTagLabelById,
  showCompany,
  onClick,
}: {
  post: ScheduledPost;
  accountNameById: Record<string, string>;
  companyNameById: Record<string, string>;
  formatTagLabelById: Record<string, string>;
  showCompany: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60",
        post.post_kind === "target" && "bg-gradient-to-r from-warning/8 to-transparent",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{post.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={POST_KIND_BADGE_VARIANT[post.post_kind]}>
            {post.post_kind === "target" ? <Target className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {POST_KIND_LABEL[post.post_kind]}
          </Badge>
          {post.format_tag_id && (
            <span className="text-xs text-muted-foreground">{formatTagLabelById[post.format_tag_id] ?? "?"}</span>
          )}
          {post.collaborator && <Badge variant="accent">{post.collaborator}</Badge>}
          {post.reddit_account_id && (
            <span className="text-xs text-muted-foreground">{accountNameById[post.reddit_account_id] ?? "?"}</span>
          )}
          {showCompany && (
            <span className="text-xs text-muted-foreground">· {companyNameById[post.company_id] ?? "?"}</span>
          )}
        </div>
      </div>
      {post.is_posted ? (
        <Badge variant="good" className="shrink-0">
          <CheckCircle2 className="h-3 w-3" /> Posted
        </Badge>
      ) : (
        <Badge variant="neutral" className="shrink-0">
          <Clock3 className="h-3 w-3" /> Pending
        </Badge>
      )}
    </button>
  );
}
