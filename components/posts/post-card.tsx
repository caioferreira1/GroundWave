"use client";

import { useRef } from "react";
import {
  ArrowBigUp,
  Calendar,
  ExternalLink,
  Hash,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
} from "lucide-react";
import { Badge, Card, CardContent, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

export type PostCardData = {
  id: string;
  author: string | null;
  url: string;
  content: string | null;
  subreddit: string | null;
  upvotes: number | null;
  posted_at: string | null;
  ai_status: "pending" | "processed" | "failed";
  is_relevant: boolean | null;
  relevance_score: number | null;
  ai_reasoning: string | null;
  ai_error: string | null;
  human_verdict: "relevant" | "irrelevant" | null;
  generated_comment: string | null;
  comment_posted_at: string | null;
  comment_views_count: number | null;
  is_manual: boolean;
  comment_type: "generic" | "target" | null;
};

type StaffMember = { id: string; display_name: string | null; email: string | null };
type RedditAccount = { id: string; account_name: string };

/**
 * Native <dialog> (same pattern as ManualCommentDialog) instead of a custom
 * overlay — showModal() gives centering, focus trap, Esc-to-close, and a
 * blurred backdrop for free. The compact card is just a preview (truncated
 * content, no actions); clicking it opens the dialog with the full text and
 * every action that used to live inline in the card.
 */
export function PostCard({
  post,
  isStaff,
  currentUserId,
  postedByName,
  accountName,
  staffMembers,
  activeAccounts,
  markRelevantAction,
  markIrrelevantAction,
  generateCommentAction,
  saveGeneratedCommentAction,
  setCommentViewsAction,
  markCommentPostedAction,
  unmarkCommentPostedAction,
}: {
  post: PostCardData;
  isStaff: boolean;
  currentUserId: string | null;
  postedByName: string | null;
  accountName: string | null;
  staffMembers: StaffMember[];
  activeAccounts: RedditAccount[];
  markRelevantAction: () => Promise<void>;
  markIrrelevantAction: () => Promise<void>;
  generateCommentAction: () => Promise<void>;
  saveGeneratedCommentAction: (formData: FormData) => Promise<void>;
  setCommentViewsAction: (formData: FormData) => Promise<void>;
  markCommentPostedAction: (formData: FormData) => Promise<void>;
  unmarkCommentPostedAction: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      {post.is_manual ? (
        <Badge variant="accent">Manual entry</Badge>
      ) : (
        <>
          <Badge
            variant={
              post.ai_status === "processed"
                ? "good"
                : post.ai_status === "failed"
                  ? "critical"
                  : "neutral"
            }
          >
            {post.ai_status}
          </Badge>
          {post.ai_status === "processed" && (
            <Badge variant={post.is_relevant ? "good" : "neutral"}>
              {post.is_relevant ? "Relevant" : "Not relevant"} ({post.relevance_score})
            </Badge>
          )}
          {post.human_verdict && <Badge variant="accent">Human: {post.human_verdict}</Badge>}
        </>
      )}
      {post.comment_posted_at && <Badge variant="good">Posted</Badge>}
    </div>
  );

  const meta = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {post.author && (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <User className="h-3.5 w-3.5" /> u/{post.author}
        </span>
      )}
      {post.subreddit && (
        <span className="inline-flex items-center gap-1">
          <Hash className="h-3.5 w-3.5" /> r/{post.subreddit}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <ArrowBigUp className="h-3.5 w-3.5" /> {post.upvotes ?? 0}
      </span>
      <span className="inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" />
        {post.posted_at ? new Date(post.posted_at).toLocaleString() : "unknown date"}
      </span>
      <a
        href={post.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" /> View on Reddit
      </a>
    </div>
  );

  return (
    <>
      <Card
        interactive
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        className={cx("cursor-pointer", post.comment_posted_at && "border-success/40 bg-success/5")}
      >
        <CardContent className="space-y-3">
          {badges}
          {meta}
          {post.content && <p className="line-clamp-3 text-sm text-foreground">{post.content}</p>}
          {post.ai_reasoning && (
            <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground italic">
              {post.ai_reasoning}
            </p>
          )}
          {post.ai_error && <p className="text-xs text-destructive">{post.ai_error}</p>}
        </CardContent>
      </Card>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onCancel={close}
        className="fixed top-1/2 left-1/2 m-0 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/20 backdrop:backdrop-blur-sm"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              {badges}
              {meta}
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {post.content && (
            <p className="text-sm whitespace-pre-wrap text-foreground">{post.content}</p>
          )}

          {post.ai_reasoning && (
            <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground italic">
              {post.ai_reasoning}
            </p>
          )}
          {post.ai_error && <p className="text-xs text-destructive">{post.ai_error}</p>}

          <div className="space-y-2 rounded-lg border border-primary/15 bg-accent p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-accent-foreground uppercase">
                Reply draft
              </span>
              {post.comment_posted_at && (
                <Badge variant="good">
                  Posted{postedByName && ` by ${postedByName}`}
                  {accountName && ` · u/${accountName}`}
                  {post.comment_type && ` · ${post.comment_type}`}
                </Badge>
              )}
            </div>

            {isStaff && post.comment_posted_at && (
              <form action={setCommentViewsAction} className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground" htmlFor={`views-${post.id}`}>
                  Views
                </label>
                <Input
                  id={`views-${post.id}`}
                  type="number"
                  name="comment_views_count"
                  min={0}
                  defaultValue={post.comment_views_count ?? ""}
                  className="h-8 w-24 text-xs"
                />
                <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                  Save
                </SubmitButton>
              </form>
            )}

            {post.generated_comment ? (
              isStaff ? (
                <form action={saveGeneratedCommentAction} className="space-y-2">
                  <Textarea
                    key={post.generated_comment}
                    name="generated_comment"
                    rows={3}
                    defaultValue={post.generated_comment}
                    className="text-sm"
                  />
                  <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                    Save edits
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-foreground">{post.generated_comment}</p>
              )
            ) : (
              !isStaff && <p className="text-xs text-muted-foreground">No reply drafted yet.</p>
            )}

            {isStaff && (
              <div className="flex flex-wrap items-center gap-2">
                {!post.is_manual && (
                  <form action={generateCommentAction} className="flex items-center gap-2">
                    <SubmitButton variant="secondary" size="sm" pendingText="Generating…">
                      {post.generated_comment ? "Regenerate" : "Generate reply"}
                    </SubmitButton>
                  </form>
                )}

                {post.generated_comment &&
                  (post.comment_posted_at ? (
                    <form action={unmarkCommentPostedAction}>
                      <SubmitButton variant="ghost" size="sm" pendingText="Unmarking…">
                        Unmark as posted
                      </SubmitButton>
                    </form>
                  ) : (
                    <form
                      action={markCommentPostedAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Select
                        name="posted_by"
                        defaultValue={currentUserId ?? ""}
                        required
                        className="h-8 w-auto text-xs"
                      >
                        <option value="" disabled>
                          Who posted this?
                        </option>
                        {staffMembers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.display_name ?? s.email}
                          </option>
                        ))}
                      </Select>
                      {activeAccounts.length > 0 && (
                        <>
                          <Select
                            name="reddit_account_id"
                            defaultValue=""
                            className="h-8 w-auto text-xs"
                          >
                            <option value="">No account tracked</option>
                            {activeAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                u/{a.account_name}
                              </option>
                            ))}
                          </Select>
                          <Select
                            name="comment_type"
                            defaultValue="target"
                            className="h-8 w-auto text-xs"
                          >
                            <option value="target">Target (mentions/contributes)</option>
                            <option value="generic">Generic</option>
                          </Select>
                        </>
                      )}
                      <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                        Mark as posted
                      </SubmitButton>
                    </form>
                  ))}
              </div>
            )}
          </div>

          {isStaff && !post.is_manual && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <form action={markRelevantAction}>
                <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                  <ThumbsUp className="h-3.5 w-3.5" /> Mark relevant
                </SubmitButton>
              </form>
              <form action={markIrrelevantAction}>
                <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                  <ThumbsDown className="h-3.5 w-3.5" /> Mark irrelevant
                </SubmitButton>
              </form>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
