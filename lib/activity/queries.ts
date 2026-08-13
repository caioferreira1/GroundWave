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
