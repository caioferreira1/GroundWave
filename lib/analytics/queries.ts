import type { createClient } from "@/lib/supabase/server";
import { countByWeek, sumByWeek, weekWindowStartIso } from "./bucket";
import type {
  CollaboratorActivity,
  CommentsTrendPoint,
  DateCount,
  OverviewTotals,
  SubredditCount,
  ViewsTrendPoint,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Trend charts show `DEFAULT_PAST_WEEKS` (including the current one) plus `DEFAULT_FUTURE_WEEKS` of zero-filled runway ahead. */
const DEFAULT_PAST_WEEKS = 12;
const DEFAULT_FUTURE_WEEKS = 4;

/** Category breakdown charts (by subreddit) show at most this many bars — the long tail folds into "Other". */
const MAX_SUBREDDIT_BARS = 8;

function countBySubreddit(values: (string | null)[]): SubredditCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([subreddit, count]) => ({ subreddit, count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length <= MAX_SUBREDDIT_BARS) return sorted;

  const top = sorted.slice(0, MAX_SUBREDDIT_BARS - 1);
  const otherCount = sorted.slice(MAX_SUBREDDIT_BARS - 1).reduce((sum, s) => sum + s.count, 0);
  return [...top, { subreddit: "Other", count: otherCount }];
}

/**
 * All queries here take the request-scoped, RLS-enforced client a page
 * already created (never the admin client) — reads are staff-only anyway
 * via the page's own auth check, and RLS already scopes rows to companyId.
 *
 * No SQL aggregation (no `GROUP BY`, no RPC/views) — deliberate, matching
 * the current data volume (single pilot company). Revisit with a Postgres
 * view/RPC if row counts grow well past pilot scale.
 */

export async function getPostsPostedTrend(
  supabase: SupabaseServerClient,
  companyId: string,
  pastWeeks: number = DEFAULT_PAST_WEEKS,
  futureWeeks: number = DEFAULT_FUTURE_WEEKS,
): Promise<DateCount[]> {
  const { data } = await supabase
    .from("post_generations")
    .select("posted_at")
    .eq("company_id", companyId)
    .eq("mode", "company")
    .not("posted_at", "is", null)
    .gte("posted_at", weekWindowStartIso(pastWeeks));

  return countByWeek((data ?? []).map((row) => row.posted_at), pastWeeks, futureWeeks);
}

export async function getCommentsTrend(
  supabase: SupabaseServerClient,
  companyId: string,
  pastWeeks: number = DEFAULT_PAST_WEEKS,
  futureWeeks: number = DEFAULT_FUTURE_WEEKS,
): Promise<CommentsTrendPoint[]> {
  const windowStart = weekWindowStartIso(pastWeeks);

  const [{ data: generatedRows }, { data: postedRows }] = await Promise.all([
    supabase
      .from("posts")
      .select("comment_generated_at")
      .eq("company_id", companyId)
      .not("comment_generated_at", "is", null)
      .gte("comment_generated_at", windowStart),
    supabase
      .from("posts")
      .select("comment_posted_at")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null)
      .gte("comment_posted_at", windowStart),
  ]);

  const generated = countByWeek((generatedRows ?? []).map((row) => row.comment_generated_at), pastWeeks, futureWeeks);
  const posted = countByWeek((postedRows ?? []).map((row) => row.comment_posted_at), pastWeeks, futureWeeks);
  const postedByDate = new Map(posted.map((p) => [p.date, p.count]));

  return generated.map((g) => ({ date: g.date, generated: g.count, posted: postedByDate.get(g.date) ?? 0 }));
}

export async function getViewsTrend(
  supabase: SupabaseServerClient,
  companyId: string,
  pastWeeks: number = DEFAULT_PAST_WEEKS,
  futureWeeks: number = DEFAULT_FUTURE_WEEKS,
): Promise<ViewsTrendPoint[]> {
  const windowStart = weekWindowStartIso(pastWeeks);

  const [{ data: postRows }, { data: commentRows }] = await Promise.all([
    supabase
      .from("post_generations")
      .select("posted_at, views_count")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .gte("posted_at", windowStart),
    supabase
      .from("posts")
      .select("comment_posted_at, comment_views_count")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null)
      .gte("comment_posted_at", windowStart),
  ]);

  const postViews = sumByWeek(
    (postRows ?? []).map((row) => ({ date: row.posted_at, value: row.views_count })),
    pastWeeks,
    futureWeeks,
  );
  const commentViews = sumByWeek(
    (commentRows ?? []).map((row) => ({ date: row.comment_posted_at, value: row.comment_views_count })),
    pastWeeks,
    futureWeeks,
  );
  const commentViewsByDate = new Map(commentViews.map((c) => [c.date, c.value]));

  return postViews.map((p) => ({
    date: p.date,
    postViews: p.value,
    commentViews: commentViewsByDate.get(p.date) ?? 0,
  }));
}

/** All-time totals — a different, wider window than the 30-day trend charts above. */
export async function getOverviewTotals(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<OverviewTotals> {
  const [postsPostedResult, commentsPostedResult, postViewsRows, commentViewsRows] = await Promise.all([
    supabase
      .from("post_generations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null),
    supabase.from("post_generations").select("views_count").eq("company_id", companyId).eq("mode", "company"),
    supabase.from("posts").select("comment_views_count").eq("company_id", companyId),
  ]);

  const reportedViews =
    (postViewsRows.data ?? []).reduce((sum, row) => sum + (row.views_count ?? 0), 0) +
    (commentViewsRows.data ?? []).reduce((sum, row) => sum + (row.comment_views_count ?? 0), 0);

  return {
    postsPosted: postsPostedResult.count ?? 0,
    commentsPosted: commentsPostedResult.count ?? 0,
    reportedViews,
  };
}

/** All-time comment counts per subreddit, capped/rolled up by `countBySubreddit`. */
export async function getCommentsBySubreddit(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<SubredditCount[]> {
  const { data } = await supabase
    .from("posts")
    .select("subreddit")
    .eq("company_id", companyId)
    .not("comment_posted_at", "is", null);

  return countBySubreddit((data ?? []).map((row) => row.subreddit));
}

/** All-time posted-post counts per subreddit, capped/rolled up by `countBySubreddit`. */
export async function getPostsBySubreddit(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<SubredditCount[]> {
  const { data } = await supabase
    .from("post_generations")
    .select("subreddit")
    .eq("company_id", companyId)
    .eq("mode", "company")
    .not("posted_at", "is", null);

  return countBySubreddit((data ?? []).map((row) => row.subreddit));
}

/** All-time posts posted + comments posted per staff member who posted them. */
export async function getCollaboratorActivity(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<CollaboratorActivity[]> {
  const [{ data: commentRows }, { data: postRows }, { data: profiles }] = await Promise.all([
    supabase
      .from("posts")
      .select("comment_posted_by")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null),
    supabase
      .from("post_generations")
      .select("posted_by")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null),
    supabase.from("profiles").select("id, display_name, email"),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const counts = new Map<string, { posts: number; comments: number }>();

  for (const row of commentRows ?? []) {
    if (!row.comment_posted_by) continue;
    const entry = counts.get(row.comment_posted_by) ?? { posts: 0, comments: 0 };
    entry.comments += 1;
    counts.set(row.comment_posted_by, entry);
  }
  for (const row of postRows ?? []) {
    if (!row.posted_by) continue;
    const entry = counts.get(row.posted_by) ?? { posts: 0, comments: 0 };
    entry.posts += 1;
    counts.set(row.posted_by, entry);
  }

  return [...counts.entries()]
    .map(([id, activity]) => ({ name: nameById.get(id) ?? "Unknown", ...activity }))
    .sort((a, b) => b.posts + b.comments - (a.posts + a.comments));
}

/**
 * All-time posts + comments posted per Reddit account (same shape as
 * getCollaboratorActivity, grouped by account instead of by staff member).
 * Staff-only in practice: reddit_accounts has no client RLS policy, so a
 * client-scoped call here just gets "Unknown" names, never account handles.
 */
export async function getActivityByRedditAccount(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<CollaboratorActivity[]> {
  const [{ data: commentRows }, { data: postRows }, { data: accounts }] = await Promise.all([
    supabase
      .from("posts")
      .select("reddit_account_id")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null)
      .not("reddit_account_id", "is", null),
    supabase
      .from("post_generations")
      .select("reddit_account_id")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null),
    supabase.from("reddit_accounts").select("id, account_name").eq("company_id", companyId),
  ]);

  const nameById = new Map((accounts ?? []).map((a) => [a.id, a.account_name]));
  const counts = new Map<string, { posts: number; comments: number }>();

  for (const row of commentRows ?? []) {
    if (!row.reddit_account_id) continue;
    const entry = counts.get(row.reddit_account_id) ?? { posts: 0, comments: 0 };
    entry.comments += 1;
    counts.set(row.reddit_account_id, entry);
  }
  for (const row of postRows ?? []) {
    if (!row.reddit_account_id) continue;
    const entry = counts.get(row.reddit_account_id) ?? { posts: 0, comments: 0 };
    entry.posts += 1;
    counts.set(row.reddit_account_id, entry);
  }

  return [...counts.entries()]
    .map(([id, activity]) => ({ name: nameById.get(id) ?? "Unknown", ...activity }))
    .sort((a, b) => b.posts + b.comments - (a.posts + a.comments));
}
