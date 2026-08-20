import Link from "next/link";
import { CheckCircle2, FileText, MessagesSquare, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getApifyAccountUsage } from "@/lib/reddit/apify";
import {
  Card,
  CardContent,
  CardDescription,
  EmptyState,
  PageHeading,
  SegmentedControl,
  SegmentedControlLink,
  StatCard,
  buttonClass,
} from "@/components/ui";
import { ManualCommentDialog } from "@/components/posts/manual-comment-dialog";
import { PostCard } from "@/components/posts/post-card";
import { RunIngestionButton } from "@/components/posts/run-ingestion-button";
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

// "all" is an explicit sentinel (not just an absent param) so the filter bar
// can offer a real "show everything" state distinct from "no params yet" —
// see resolveTriState below, since relevant/answered default to non-"all"
// values when the param is missing.
type TriState = "true" | "false" | "all";

const RELEVANT_FILTERS: readonly { value: TriState; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "true", label: "Relevant" },
  { value: "false", label: "Not relevant" },
];

const ANSWERED_FILTERS: readonly { value: TriState; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "true", label: "Answered" },
  { value: "false", label: "Not answered" },
];

/** Missing/garbage query values fall back to `fallback` — "all" is only ever reached by an explicit click. */
function resolveTriState(raw: string | undefined, fallback: TriState): TriState {
  return raw === "true" || raw === "false" || raw === "all" ? raw : fallback;
}

function filterHref(
  companyId: string,
  params: { status?: string; relevant: TriState; answered: TriState },
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  qs.set("relevant", params.relevant);
  qs.set("answered", params.answered);
  return `/companies/${companyId}/posts?${qs.toString()}`;
}

export default async function CompanyPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ status?: string; relevant?: string; answered?: string }>;
}) {
  const { companyId } = await params;
  const { status, relevant: relevantRaw, answered: answeredRaw } = await searchParams;
  const statusFilter =
    status === "pending" || status === "processed" || status === "failed" ? status : undefined;
  // Landing on the page with no filters at all defaults to "relevant, not yet
  // answered" — the useful triage view — while still letting "Any"/"Any"
  // reach a real show-everything state via the explicit "all" sentinel.
  const relevant = resolveTriState(relevantRaw, "true");
  const answered = resolveTriState(answeredRaw, "false");
  const isShowingEverything = !statusFilter && relevant === "all" && answered === "all";

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
  if (statusFilter) query = query.eq("ai_status", statusFilter);
  if (relevant !== "all") query = query.eq("is_relevant", relevant === "true");
  if (answered !== "all") {
    query =
      answered === "true"
        ? query.not("comment_posted_at", "is", null)
        : query.is("comment_posted_at", null);
  }

  // Company-wide totals for the summary cards — deliberately unfiltered by
  // the status/relevant/answered filters above (and not capped at the
  // `posts` query's 100-row limit) so they read as a stable overview
  // regardless of which slice is currently shown below.
  const [{ data: posts }, { count: totalCount }, { count: relevantCount }, { count: answeredCount }] =
    await Promise.all([
      query,
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_relevant", true),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .not("comment_posted_at", "is", null),
    ]);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Total posts"
          value={<span className="text-2xl font-semibold text-foreground">{totalCount ?? 0}</span>}
        />
        <StatCard
          icon={ThumbsUp}
          label="Relevant"
          value={<span className="text-2xl font-semibold text-foreground">{relevantCount ?? 0}</span>}
        />
        <StatCard
          icon={CheckCircle2}
          label="Answered"
          value={<span className="text-2xl font-semibold text-foreground">{answeredCount ?? 0}</span>}
        />
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
            <RunIngestionButton action={runNowAction} lastRun={lastRun} usage={usage} />
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
                href={filterHref(companyId, { status: f.value, relevant, answered })}
                active={statusFilter === f.value}
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
                href={filterHref(companyId, { status: statusFilter, relevant: f.value, answered })}
                active={relevant === f.value}
              >
                {f.label}
              </SegmentedControlLink>
            ))}
          </SegmentedControl>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Answered</p>
          <SegmentedControl>
            {ANSWERED_FILTERS.map((f) => (
              <SegmentedControlLink
                key={f.label}
                href={filterHref(companyId, { status: statusFilter, relevant, answered: f.value })}
                active={answered === f.value}
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
            <PostCard
              key={post.id}
              post={post}
              isStaff={isStaff}
              currentUserId={user?.id ?? null}
              postedByName={
                post.comment_posted_by ? (profileMap.get(post.comment_posted_by) ?? "unknown") : null
              }
              accountName={
                post.reddit_account_id ? (accountNameById.get(post.reddit_account_id) ?? "unknown") : null
              }
              staffMembers={staffMembers}
              activeAccounts={activeAccounts}
              markRelevantAction={setHumanVerdict.bind(null, companyId, post.id, "relevant")}
              markIrrelevantAction={setHumanVerdict.bind(null, companyId, post.id, "irrelevant")}
              generateCommentAction={generateComment.bind(null, companyId, post.id)}
              saveGeneratedCommentAction={saveGeneratedComment.bind(null, companyId, post.id)}
              setCommentViewsAction={setCommentViews.bind(null, companyId, post.id)}
              markCommentPostedAction={markCommentPosted.bind(null, companyId, post.id)}
              unmarkCommentPostedAction={unmarkCommentPosted.bind(null, companyId, post.id)}
            />
          ))}
        </div>
      ) : !isShowingEverything ? (
        <EmptyState
          icon={MessagesSquare}
          title="No posts match these filters"
          description="Try a different status, relevance, or answered filter."
          action={
            <Link
              href={filterHref(companyId, { relevant: "all", answered: "all" })}
              className={buttonClass("secondary", "sm")}
            >
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
