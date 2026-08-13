import Link from "next/link";
import {
  ArrowBigUp,
  Calendar,
  ExternalLink,
  Hash,
  MessagesSquare,
  ThumbsDown,
  ThumbsUp,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getApifyAccountUsage } from "@/lib/reddit/apify";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  EmptyState,
  Input,
  PageHeading,
  SegmentedControl,
  SegmentedControlLink,
  Select,
  SubmitButton,
  Textarea,
  buttonClass,
} from "@/components/ui";
import { ManualCommentDialog } from "@/components/posts/manual-comment-dialog";
import {
  addManualComment,
  generateComment,
  markCommentPosted,
  runIngestionNow,
  saveGeneratedComment,
  setCommentViews,
  setHumanVerdict,
  unmarkCommentPosted,
} from "./actions";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
] as const;

const RELEVANT_FILTERS = [
  { value: undefined, label: "Any" },
  { value: "true", label: "Relevant" },
  { value: "false", label: "Not relevant" },
] as const;

function filterHref(companyId: string, params: { status?: string; relevant?: string }) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.relevant) qs.set("relevant", params.relevant);
  const query = qs.toString();
  return `/companies/${companyId}/posts${query ? `?${query}` : ""}`;
}

export default async function CompanyPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ status?: string; relevant?: string }>;
}) {
  const { companyId } = await params;
  const { status, relevant } = await searchParams;
  const hasFilters = Boolean(status || relevant);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  let query = supabase
    .from("posts")
    .select(
      "id, author, url, content, subreddit, upvotes, posted_at, received_at, ai_status, is_relevant, relevance_score, ai_reasoning, ai_error, human_verdict, generated_comment, comment_posted_at, comment_posted_by, comment_views_count, is_manual, reddit_account_id, comment_type",
    )
    .eq("company_id", companyId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (status === "pending" || status === "processed" || status === "failed") {
    query = query.eq("ai_status", status);
  }
  if (relevant) query = query.eq("is_relevant", relevant === "true");

  const { data: posts } = await query;

  // Who's eligible to be credited as "posted this comment" — staff only,
  // since only staff post replies on Reddit. Kept for future per-poster
  // metrics (reply volume, engagement, etc.).
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, email");
  const { data: staffRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "coworker"]);
  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));

  // Reddit accounts this company has registered — used to tag which account
  // posted a comment (see lib/activity/rotation.ts for what the tagging
  // feeds). All accounts (not just active) so old tags still resolve a name;
  // only active ones are offered as choices going forward.
  const { data: redditAccounts } = await supabase
    .from("reddit_accounts")
    .select("id, account_name, is_active")
    .eq("company_id", companyId)
    .order("account_name", { ascending: true });
  const accountNameById = new Map((redditAccounts ?? []).map((a) => [a.id, a.account_name]));
  const activeAccounts = (redditAccounts ?? []).filter((a) => a.is_active);

  const boundAddManualComment = addManualComment.bind(null, companyId);
  const runNowAction = runIngestionNow.bind(null, companyId);

  let lastRun: { cost_usd: number; item_count: number; status: string } | null = null;
  let usage: Awaited<ReturnType<typeof getApifyAccountUsage>> | null = null;
  if (isStaff) {
    const { data } = await supabase
      .from("apify_runs")
      .select("cost_usd, item_count, status")
      .eq("company_id", companyId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastRun = data;
    try {
      usage = await getApifyAccountUsage();
    } catch {
      // APIFY_TOKEN missing/invalid or the API is down — show "unavailable"
      // instead of breaking the whole Posts page over a discreet caption.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title="Posts" description="Reddit posts ingested for this company." />
        {isStaff && (
          <ManualCommentDialog
            action={boundAddManualComment}
            staffMembers={staffMembers}
            currentUserId={user?.id ?? null}
            accounts={activeAccounts}
          />
        )}
      </div>

      {isStaff && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Run ingestion now</p>
              <CardDescription>
                Starts the Apify Reddit scraper for this company in the background (uses real
                Apify credits) — same code path as the daily cron. A real run takes a few
                minutes; results show up here once it finishes, no need to wait on this page.
              </CardDescription>
            </div>
            <form action={runNowAction} className="flex flex-col items-end gap-1.5">
              <SubmitButton variant="secondary" size="sm" pendingText="Starting…">
                Run ingestion now
              </SubmitButton>
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
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</p>
          <SegmentedControl>
            {STATUS_FILTERS.map((f) => (
              <SegmentedControlLink
                key={f.label}
                href={filterHref(companyId, { status: f.value, relevant })}
                active={status === f.value}
              >
                {f.label}
              </SegmentedControlLink>
            ))}
          </SegmentedControl>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Relevance</p>
          <SegmentedControl>
            {RELEVANT_FILTERS.map((f) => (
              <SegmentedControlLink
                key={f.label}
                href={filterHref(companyId, { status, relevant: f.value })}
                active={relevant === f.value}
              >
                {f.label}
              </SegmentedControlLink>
            ))}
          </SegmentedControl>
        </div>
      </div>

      {(posts ?? []).length > 0 ? (
        <div className="space-y-3">
          {(posts ?? []).map((post) => (
            <Card key={post.id} interactive>
              <CardContent className="space-y-3">
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
                </div>

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
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View on Reddit
                  </a>
                </div>

                {post.content && <p className="line-clamp-3 text-sm text-foreground">{post.content}</p>}

                {post.ai_reasoning && (
                  <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground italic">
                    {post.ai_reasoning}
                  </p>
                )}
                {post.ai_error && <p className="text-xs text-destructive">{post.ai_error}</p>}

                {post.is_relevant && (
                  <div className="space-y-2 rounded-lg border border-primary/15 bg-accent p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-accent-foreground uppercase">
                        Reply draft
                      </span>
                      {post.comment_posted_at && (
                        <Badge variant="good">
                          Posted{post.comment_posted_by && ` by ${profileMap.get(post.comment_posted_by) ?? "unknown"}`}
                          {post.reddit_account_id &&
                            ` · u/${accountNameById.get(post.reddit_account_id) ?? "unknown"}`}
                          {post.comment_type && ` · ${post.comment_type}`}
                        </Badge>
                      )}
                    </div>

                    {isStaff && post.comment_posted_at && (
                      <form
                        action={setCommentViews.bind(null, companyId, post.id)}
                        className="flex items-center gap-2"
                      >
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
                        <form
                          action={saveGeneratedComment.bind(null, companyId, post.id)}
                          className="space-y-2"
                        >
                          <Textarea
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
                          <form
                            action={generateComment.bind(null, companyId, post.id)}
                            className="flex items-center gap-2"
                          >
                            <SubmitButton variant="secondary" size="sm" pendingText="Generating…">
                              {post.generated_comment ? "Regenerate" : "Generate reply"}
                            </SubmitButton>
                          </form>
                        )}

                        {post.generated_comment &&
                          (post.comment_posted_at ? (
                            <form action={unmarkCommentPosted.bind(null, companyId, post.id)}>
                              <SubmitButton variant="ghost" size="sm" pendingText="Unmarking…">
                                Unmark as posted
                              </SubmitButton>
                            </form>
                          ) : (
                            <form
                              action={markCommentPosted.bind(null, companyId, post.id)}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <Select
                                name="posted_by"
                                defaultValue={user?.id ?? ""}
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
                                  <Select name="reddit_account_id" defaultValue="" className="h-8 w-auto text-xs">
                                    <option value="">No account tracked</option>
                                    {activeAccounts.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        u/{a.account_name}
                                      </option>
                                    ))}
                                  </Select>
                                  <Select name="comment_type" defaultValue="target" className="h-8 w-auto text-xs">
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
                )}
              </CardContent>

              {isStaff && !post.is_manual && (
                <CardFooter className="flex-wrap justify-end">
                  <form action={setHumanVerdict.bind(null, companyId, post.id, "relevant")}>
                    <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                      <ThumbsUp className="h-3.5 w-3.5" /> Mark relevant
                    </SubmitButton>
                  </form>
                  <form action={setHumanVerdict.bind(null, companyId, post.id, "irrelevant")}>
                    <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                      <ThumbsDown className="h-3.5 w-3.5" /> Mark irrelevant
                    </SubmitButton>
                  </form>
                </CardFooter>
              )}
            </Card>
          ))}
        </div>
      ) : hasFilters ? (
        <EmptyState
          icon={MessagesSquare}
          title="No posts match these filters"
          description="Try a different status or relevance filter."
          action={
            <Link href={`/companies/${companyId}/posts`} className={buttonClass("secondary", "sm")}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title="No posts yet"
          description="Once ingestion runs (or the inbound webhook receives a post), they'll show up here."
          action={
            <Link
              href={`/companies/${companyId}/settings`}
              className={buttonClass("secondary", "sm")}
            >
              Check ingestion settings
            </Link>
          }
        />
      )}
    </div>
  );
}
