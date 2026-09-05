import type { createClient } from "@/lib/supabase/server";
import { weekWindowStartIso } from "@/lib/analytics/bucket";
import type { DailyActivity, WeekActivity } from "./rotation";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PostGenerationActivityRow = { reddit_account_id: string; post_type: string | null; posted_at: string };

/**
 * mode='generic' post_generations rows tagged to one of `accountIds` —
 * standalone /generic-post-generator posts that got attributed to a company
 * at mark-posted time via the Reddit account chosen (see
 * lib/activity/accounts.ts's getCompanyRedditAccountIds for why an account,
 * not company_id, is the join key for generic-mode rows). Returns [] without
 * querying when `accountIds` is empty, so callers can unconditionally spread
 * the result alongside their company_id-scoped query.
 */
async function getGenericPostGenerationActivity(
  supabase: SupabaseServerClient,
  accountIds: string[],
  options: { gte?: string; lt?: string; orderNewestFirst?: boolean } = {},
): Promise<PostGenerationActivityRow[]> {
  if (accountIds.length === 0) return [];

  let query = supabase
    .from("post_generations")
    .select("reddit_account_id, post_type, posted_at")
    .eq("mode", "generic")
    .not("posted_at", "is", null)
    .in("reddit_account_id", accountIds);

  if (options.gte) query = query.gte("posted_at", options.gte);
  if (options.lt) query = query.lt("posted_at", options.lt);
  if (options.orderNewestFirst) query = query.order("posted_at", { ascending: false });

  const { data } = await query;
  return (data ?? []) as PostGenerationActivityRow[];
}

/**
 * Feeds lib/activity/rotation.ts: this ISO week's tagged comment/post counts
 * per account, plus each account's most recent generic/company-mention post
 * ever (unbounded by week — needed to tell whether a generic post is overdue
 * and who's least-recently done a company-mention post). No SQL aggregation,
 * same "pilot scale" approach as lib/analytics/queries.ts.
 *
 * `accountIds` (this company's Reddit accounts, from
 * getCompanyRedditAccountIds) additionally pulls in mode='generic'
 * post_generations rows posted with one of those accounts — posts made on
 * the standalone /generic-post-generator page but tagged to this company's
 * account at mark-posted time. Additive only: a row's mode is exclusively
 * 'company' or 'generic', so this can never double up against the
 * company_id-scoped query below.
 */
export async function getWeekActivityForRotation(
  supabase: SupabaseServerClient,
  companyId: string,
  accountIds: string[],
): Promise<WeekActivity> {
  const weekStart = weekWindowStartIso(1);

  const [{ data: weekComments }, { data: weekPosts }, weekPostsGeneric, { data: allPosts }, allPostsGeneric] = await Promise.all([
    supabase
      .from("posts")
      .select("reddit_account_id, comment_type, comment_posted_at")
      .eq("company_id", companyId)
      .not("comment_posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .gte("comment_posted_at", weekStart),
    supabase
      .from("post_generations")
      .select("reddit_account_id, post_type, posted_at")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .gte("posted_at", weekStart),
    getGenericPostGenerationActivity(supabase, accountIds, { gte: weekStart }),
    supabase
      .from("post_generations")
      .select("reddit_account_id, post_type, posted_at")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null)
      .order("posted_at", { ascending: false }),
    getGenericPostGenerationActivity(supabase, accountIds, { orderNewestFirst: true }),
  ]);

  const combinedWeekPosts = [...(weekPosts ?? []), ...weekPostsGeneric];
  // Both sources are already newest-first; merge-by-recency so the combined
  // list stays newest-first for the walks below.
  const combinedAllPosts = [...(allPosts ?? []), ...allPostsGeneric].sort((a, b) =>
    (a.posted_at ?? "") < (b.posted_at ?? "") ? 1 : (a.posted_at ?? "") > (b.posted_at ?? "") ? -1 : 0,
  );

  const commentsByAccount = new Map<string, { generic: number; target: number }>();
  const commentsByAccountByDay = new Map<string, Map<string, { generic: number; target: number }>>();
  for (const row of weekComments ?? []) {
    if (!row.reddit_account_id || !row.comment_posted_at) continue;
    const entry = commentsByAccount.get(row.reddit_account_id) ?? { generic: 0, target: 0 };
    if (row.comment_type === "generic") entry.generic += 1;
    else if (row.comment_type === "target") entry.target += 1;
    commentsByAccount.set(row.reddit_account_id, entry);

    const day = row.comment_posted_at.slice(0, 10);
    const byDay = commentsByAccountByDay.get(row.reddit_account_id) ?? new Map<string, { generic: number; target: number }>();
    const dayEntry = byDay.get(day) ?? { generic: 0, target: 0 };
    if (row.comment_type === "generic") dayEntry.generic += 1;
    else if (row.comment_type === "target") dayEntry.target += 1;
    byDay.set(day, dayEntry);
    commentsByAccountByDay.set(row.reddit_account_id, byDay);
  }

  const postsByAccount = new Map<string, { generic: number; company_mention: number }>();
  const postsByAccountByDay = new Map<string, Map<string, { generic: number; company_mention: number }>>();
  for (const row of combinedWeekPosts) {
    if (!row.reddit_account_id || !row.posted_at) continue;
    const entry = postsByAccount.get(row.reddit_account_id) ?? { generic: 0, company_mention: 0 };
    if (row.post_type === "generic") entry.generic += 1;
    else if (row.post_type === "target") entry.company_mention += 1;
    postsByAccount.set(row.reddit_account_id, entry);

    const day = row.posted_at.slice(0, 10);
    const byDay = postsByAccountByDay.get(row.reddit_account_id) ?? new Map<string, { generic: number; company_mention: number }>();
    const dayEntry = byDay.get(day) ?? { generic: 0, company_mention: 0 };
    if (row.post_type === "generic") dayEntry.generic += 1;
    else if (row.post_type === "target") dayEntry.company_mention += 1;
    byDay.set(day, dayEntry);
    postsByAccountByDay.set(row.reddit_account_id, byDay);
  }

  // combinedAllPosts is ordered newest-first, so the first row seen per
  // (account, type) pair is that account's most recent post of that type.
  const lastGenericPostAt = new Map<string, string | null>();
  const lastCompanyMentionPostAt = new Map<string, string | null>();
  for (const row of combinedAllPosts) {
    if (!row.reddit_account_id) continue;
    if (row.post_type === "generic" && !lastGenericPostAt.has(row.reddit_account_id)) {
      lastGenericPostAt.set(row.reddit_account_id, row.posted_at);
    }
    if (row.post_type === "target" && !lastCompanyMentionPostAt.has(row.reddit_account_id)) {
      lastCompanyMentionPostAt.set(row.reddit_account_id, row.posted_at);
    }
  }

  // Same newest-first walk: count generic posts per account until hitting
  // that account's most recent company_mention row (stop there — anything
  // older doesn't count toward the current streak), or running out (count
  // all its generic posts ever, if it's never made a company-mention post).
  const genericPostsSinceLastCompanyMention = new Map<string, number>();
  const resolvedForMention = new Set<string>();
  for (const row of combinedAllPosts) {
    if (!row.reddit_account_id || resolvedForMention.has(row.reddit_account_id)) continue;
    if (row.post_type === "target") {
      resolvedForMention.add(row.reddit_account_id);
      if (!genericPostsSinceLastCompanyMention.has(row.reddit_account_id)) {
        genericPostsSinceLastCompanyMention.set(row.reddit_account_id, 0);
      }
    } else if (row.post_type === "generic") {
      const current = genericPostsSinceLastCompanyMention.get(row.reddit_account_id) ?? 0;
      genericPostsSinceLastCompanyMention.set(row.reddit_account_id, current + 1);
    }
  }

  return {
    commentsByAccount,
    postsByAccount,
    lastGenericPostAt,
    lastCompanyMentionPostAt,
    genericPostsSinceLastCompanyMention,
    commentsByAccountByDay,
    postsByAccountByDay,
  };
}

/**
 * Real tagged activity (reddit_account_id + comment_type/post_type) posted
 * specifically on `taskDate` — day-scoped, unlike getWeekActivityForRotation's
 * week window. Feeds lib/activity/rotation.ts's computeAutoCompletedKeys(),
 * which auto-checks a Today's tasks chip once today's real activity covers
 * what's being asked. Never folded into mergeActivity()/the weekly meters —
 * that data already flows in via getWeekActivityForRotation, so counting it
 * again here would double it.
 */
export async function getTodaysRealActivity(
  supabase: SupabaseServerClient,
  companyId: string,
  taskDate: string,
  accountIds: string[],
): Promise<DailyActivity> {
  const startIso = `${taskDate}T00:00:00.000Z`;
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const [{ data: todaysComments }, { data: todaysPosts }, todaysPostsGeneric] = await Promise.all([
    supabase
      .from("posts")
      .select("reddit_account_id, comment_type")
      .eq("company_id", companyId)
      .not("reddit_account_id", "is", null)
      .gte("comment_posted_at", startIso)
      .lt("comment_posted_at", endIso),
    supabase
      .from("post_generations")
      .select("reddit_account_id, post_type")
      .eq("company_id", companyId)
      .eq("mode", "company")
      .not("reddit_account_id", "is", null)
      .gte("posted_at", startIso)
      .lt("posted_at", endIso),
    getGenericPostGenerationActivity(supabase, accountIds, { gte: startIso, lt: endIso }),
  ]);

  const comments = new Map<string, { generic: number; target: number }>();
  for (const row of todaysComments ?? []) {
    if (!row.reddit_account_id) continue;
    const entry = comments.get(row.reddit_account_id) ?? { generic: 0, target: 0 };
    if (row.comment_type === "generic") entry.generic += 1;
    else if (row.comment_type === "target") entry.target += 1;
    comments.set(row.reddit_account_id, entry);
  }

  const posts = new Map<string, { generic: number; company_mention: number }>();
  for (const row of [...(todaysPosts ?? []), ...todaysPostsGeneric]) {
    if (!row.reddit_account_id) continue;
    const entry = posts.get(row.reddit_account_id) ?? { generic: 0, company_mention: 0 };
    if (row.post_type === "generic") entry.generic += 1;
    else if (row.post_type === "target") entry.company_mention += 1;
    posts.set(row.reddit_account_id, entry);
  }

  return { comments, posts };
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
  const commentsByAccountByDay = new Map<string, Map<string, { generic: number; target: number }>>();
  const postsByAccountByDay = new Map<string, Map<string, { generic: number; company_mention: number }>>();
  const lastGenericPostAt = new Map<string, string | null>();
  const lastCompanyMentionPostAt = new Map<string, string | null>();

  for (const row of data ?? []) {
    const isThisWeek = row.task_date >= weekStart;

    if (isThisWeek && (row.task_key === "generic_comments" || row.task_key === "target_comments")) {
      const entry = commentsByAccount.get(row.reddit_account_id) ?? { generic: 0, target: 0 };
      if (row.task_key === "generic_comments") entry.generic += row.count;
      else entry.target += row.count;
      commentsByAccount.set(row.reddit_account_id, entry);

      // Unique on (reddit_account_id, task_key, task_date), so at most one
      // row per account+type+day here — no accumulation needed, just set.
      const byDay = commentsByAccountByDay.get(row.reddit_account_id) ?? new Map<string, { generic: number; target: number }>();
      const dayEntry = byDay.get(row.task_date) ?? { generic: 0, target: 0 };
      if (row.task_key === "generic_comments") dayEntry.generic = row.count;
      else dayEntry.target = row.count;
      byDay.set(row.task_date, dayEntry);
      commentsByAccountByDay.set(row.reddit_account_id, byDay);
    }

    if (isThisWeek && (row.task_key === "generic_post" || row.task_key === "company_mention_post")) {
      const entry = postsByAccount.get(row.reddit_account_id) ?? { generic: 0, company_mention: 0 };
      if (row.task_key === "generic_post") entry.generic += row.count;
      else entry.company_mention += row.count;
      postsByAccount.set(row.reddit_account_id, entry);

      const byDay = postsByAccountByDay.get(row.reddit_account_id) ?? new Map<string, { generic: number; company_mention: number }>();
      const dayEntry = byDay.get(row.task_date) ?? { generic: 0, company_mention: 0 };
      if (row.task_key === "generic_post") dayEntry.generic = row.count;
      else dayEntry.company_mention = row.count;
      byDay.set(row.task_date, dayEntry);
      postsByAccountByDay.set(row.reddit_account_id, byDay);
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

  // Same "generic posts since last company-mention post" streak as
  // getWeekActivityForRotation, but over manual checkbox completions —
  // needs its own newest-first sort first since (unlike allPosts above)
  // this query has no .order().
  const genericPostsSinceLastCompanyMention = new Map<string, number>();
  const resolvedForMention = new Set<string>();
  const rotationRelevant = (data ?? [])
    .filter((row) => row.task_key === "generic_post" || row.task_key === "company_mention_post")
    .sort((a, b) => (a.task_date < b.task_date ? 1 : a.task_date > b.task_date ? -1 : 0));
  for (const row of rotationRelevant) {
    if (resolvedForMention.has(row.reddit_account_id)) continue;
    if (row.task_key === "company_mention_post") {
      resolvedForMention.add(row.reddit_account_id);
      if (!genericPostsSinceLastCompanyMention.has(row.reddit_account_id)) {
        genericPostsSinceLastCompanyMention.set(row.reddit_account_id, 0);
      }
    } else {
      const current = genericPostsSinceLastCompanyMention.get(row.reddit_account_id) ?? 0;
      genericPostsSinceLastCompanyMention.set(row.reddit_account_id, current + row.count);
    }
  }

  return {
    commentsByAccount,
    postsByAccount,
    lastGenericPostAt,
    lastCompanyMentionPostAt,
    genericPostsSinceLastCompanyMention,
    commentsByAccountByDay,
    postsByAccountByDay,
  };
}
