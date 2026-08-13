import type { createClient } from "@/lib/supabase/server";
import { weekWindowStartIso } from "@/lib/analytics/bucket";
import type { WeekActivity } from "./rotation";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Feeds lib/activity/rotation.ts: this ISO week's tagged comment/post counts
 * per account, plus each account's most recent generic/company-mention post
 * ever (unbounded by week — needed to tell whether a generic post is overdue
 * and who's least-recently done a company-mention post). No SQL aggregation,
 * same "pilot scale" approach as lib/analytics/queries.ts.
 */
export async function getWeekActivityForRotation(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<WeekActivity> {
  const weekStart = weekWindowStartIso(1);

  const [{ data: weekComments }, { data: weekPosts }, { data: allPosts }] = await Promise.all([
    supabase
      .from("posts")
      .select("reddit_account_id, comment_type")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .gte("comment_posted_at", weekStart),
    supabase
      .from("post_generations")
      .select("reddit_account_id, post_type")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .gte("posted_at", weekStart),
    supabase
      .from("post_generations")
      .select("reddit_account_id, post_type, posted_at")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .order("posted_at", { ascending: false }),
  ]);

  const commentsByAccount = new Map<string, { generic: number; target: number }>();
  for (const row of weekComments ?? []) {
    if (!row.reddit_account_id) continue;
    const entry = commentsByAccount.get(row.reddit_account_id) ?? { generic: 0, target: 0 };
    if (row.comment_type === "generic") entry.generic += 1;
    else if (row.comment_type === "target") entry.target += 1;
    commentsByAccount.set(row.reddit_account_id, entry);
  }

  const postsByAccount = new Map<string, { generic: number; company_mention: number }>();
  for (const row of weekPosts ?? []) {
    if (!row.reddit_account_id) continue;
    const entry = postsByAccount.get(row.reddit_account_id) ?? { generic: 0, company_mention: 0 };
    if (row.post_type === "generic") entry.generic += 1;
    else if (row.post_type === "company_mention") entry.company_mention += 1;
    postsByAccount.set(row.reddit_account_id, entry);
  }

  // allPosts is ordered newest-first, so the first row seen per
  // (account, type) pair is that account's most recent post of that type.
  const lastGenericPostAt = new Map<string, string | null>();
  const lastCompanyMentionPostAt = new Map<string, string | null>();
  for (const row of allPosts ?? []) {
    if (!row.reddit_account_id) continue;
    if (row.post_type === "generic" && !lastGenericPostAt.has(row.reddit_account_id)) {
      lastGenericPostAt.set(row.reddit_account_id, row.posted_at);
    }
    if (row.post_type === "company_mention" && !lastCompanyMentionPostAt.has(row.reddit_account_id)) {
      lastCompanyMentionPostAt.set(row.reddit_account_id, row.posted_at);
    }
  }

  return { commentsByAccount, postsByAccount, lastGenericPostAt, lastCompanyMentionPostAt };
}

/**
 * Which "Today's tasks" chips are checked off for `taskDate`, as a Set of
 * `${reddit_account_id}:${task_key}` keys — the same format the UI uses to
 * look up checkbox state. Presence = checked; there's no `completed`
 * boolean, see supabase/migrations/0018_daily_task_completions.sql.
 */
export async function getTodaysTaskCompletions(
  supabase: SupabaseServerClient,
  companyId: string,
  taskDate: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("daily_task_completions")
    .select("reddit_account_id, task_key")
    .eq("company_id", companyId)
    .eq("task_date", taskDate);

  return new Set((data ?? []).map((row) => `${row.reddit_account_id}:${row.task_key}`));
}

/**
 * Manual completions (supabase/migrations/0018), in the exact same shape as
 * getWeekActivityForRotation's WeekActivity, so lib/activity/rotation.ts's
 * mergeActivity() can fold them on top of real tagged activity. Fetches all
 * of a company's completions ever (small table, same "no SQL aggregation,
 * compute client-side" approach as the allPosts query above) — this-week
 * rows feed the comment/post counts, and every row feeds the last-done-ever
 * maps used for the generic-post cadence and company-mention rotation.
 */
export async function getManualCompletionActivity(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<WeekActivity> {
  const weekStart = weekWindowStartIso(1).slice(0, 10);

  const { data } = await supabase
    .from("daily_task_completions")
    .select("reddit_account_id, task_key, task_date, count")
    .eq("company_id", companyId);

  const commentsByAccount = new Map<string, { generic: number; target: number }>();
  const postsByAccount = new Map<string, { generic: number; company_mention: number }>();
  const lastGenericPostAt = new Map<string, string | null>();
  const lastCompanyMentionPostAt = new Map<string, string | null>();

  for (const row of data ?? []) {
    const isThisWeek = row.task_date >= weekStart;

    if (isThisWeek && (row.task_key === "generic_comments" || row.task_key === "target_comments")) {
      const entry = commentsByAccount.get(row.reddit_account_id) ?? { generic: 0, target: 0 };
      if (row.task_key === "generic_comments") entry.generic += row.count;
      else entry.target += row.count;
      commentsByAccount.set(row.reddit_account_id, entry);
    }

    if (isThisWeek && (row.task_key === "generic_post" || row.task_key === "company_mention_post")) {
      const entry = postsByAccount.get(row.reddit_account_id) ?? { generic: 0, company_mention: 0 };
      if (row.task_key === "generic_post") entry.generic += row.count;
      else entry.company_mention += row.count;
      postsByAccount.set(row.reddit_account_id, entry);
    }

    if (row.task_key === "generic_post") {
      const current = lastGenericPostAt.get(row.reddit_account_id);
      if (!current || row.task_date > current) lastGenericPostAt.set(row.reddit_account_id, row.task_date);
    }
    if (row.task_key === "company_mention_post") {
      const current = lastCompanyMentionPostAt.get(row.reddit_account_id);
      if (!current || row.task_date > current) lastCompanyMentionPostAt.set(row.reddit_account_id, row.task_date);
    }
  }

  return { commentsByAccount, postsByAccount, lastGenericPostAt, lastCompanyMentionPostAt };
}
