import type { createClient } from "@/lib/supabase/server";
import { countByWeek, sumByWeek, weekWindowStartIso } from "./bucket";
import type { CommentsTrendPoint, DateCount, OverviewTotals, ViewsTrendPoint } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Trend charts show `DEFAULT_PAST_WEEKS` (including the current one) plus `DEFAULT_FUTURE_WEEKS` of zero-filled runway ahead. */
const DEFAULT_PAST_WEEKS = 12;
const DEFAULT_FUTURE_WEEKS = 4;

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
