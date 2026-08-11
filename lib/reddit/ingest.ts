import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyPost } from "@/lib/ai/classifier";
import { buildRedditQuery, searchReddit, type NormalizedRedditPost } from "@/lib/reddit/search";

// sort=new mixes in some off-topic noise alongside fresh posts (see
// lib/reddit/search.ts) — the AI classifier is what filters that noise for
// relevance. Recency, on the other hand, has to be enforced here: without
// this, a post from months/years ago that happens to match would go
// straight to a human reviewer as if it were something to engage with today.
const MAX_POST_AGE_MS = 24 * 60 * 60 * 1000;

export type IngestCompany = {
  id: string;
  suggested_subreddits: string[] | null;
  search_keywords: string[] | null;
  posts_min_upvotes: number | null;
  posts_sort?: string | null;
  posts_max_per_run?: number | null;
};

/**
 * Dedupes `candidates` against existing posts for the company (unique on
 * `(company_id, url)`), inserts the new ones as `ai_status:'pending'`, and
 * fires the AI classifier for each. Shared by both ingestion entry points —
 * the RapidAPI-backed cron search and the external-automation webhook —
 * since dedupe+insert+classify is identical either way; only where
 * `candidates` came from differs.
 */
export async function insertAndClassifyPosts(
  companyId: string,
  candidates: NormalizedRedditPost[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  const admin = createAdminClient();
  const urls = candidates.map((c) => c.url);
  const { data: existing } = await admin
    .from("posts")
    .select("url")
    .eq("company_id", companyId)
    .in("url", urls);
  const existingUrls = new Set((existing ?? []).map((e) => e.url));

  const newRows = candidates
    .filter((c) => !existingUrls.has(c.url))
    .map((c) => ({
      company_id: companyId,
      author: c.author,
      url: c.url,
      content: c.content,
      posted_at: c.posted_at,
      upvotes: c.upvotes,
      subreddit: c.subreddit,
      ai_status: "pending" as const,
    }));

  if (newRows.length === 0) return 0;

  const { data: inserted, error } = await admin
    .from("posts")
    .insert(newRows)
    .select("id, author, url, content, company_id, subreddit");
  if (error) throw new Error(error.message);

  await Promise.allSettled(
    (inserted ?? [])
      .filter((p): p is typeof p & { company_id: string } => p.company_id !== null)
      .map((p) => classifyPost(p)),
  );

  return inserted?.length ?? 0;
}

/**
 * Runs the Reddit search for one company and ingests new posts. Returns how
 * many new posts were ingested. `posts_last_fetched_at`/`posts_last_error`
 * are stamped either way so the company overview reflects the last attempt;
 * `posts_last_scheduled_run_at` (which gates the cron "due" check) is only
 * stamped on success, so a failed scheduled run gets retried next tick
 * instead of silently skipping its slot.
 */
export async function ingestCompanyPosts(
  company: IngestCompany,
  opts?: { scheduled?: boolean },
): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  try {
    const query = buildRedditQuery(
      company.search_keywords ?? [],
      company.suggested_subreddits ?? [],
    );
    const sort = (company.posts_sort ?? "new") as "new" | "top" | "hot" | "relevance";
    const posts = await searchReddit(query, { sort });

    const minUpvotes = company.posts_min_upvotes ?? 2;
    const maxPerRun = company.posts_max_per_run ?? 100;
    const maxAgeCutoff = Date.now() - MAX_POST_AGE_MS;
    const candidates = posts
      .filter((p) => p.upvotes >= minUpvotes)
      .filter((p) => new Date(p.posted_at).getTime() >= maxAgeCutoff)
      .slice(0, maxPerRun);

    const insertedCount = await insertAndClassifyPosts(company.id, candidates);

    await admin
      .from("companies")
      .update({
        posts_last_fetched_at: now,
        posts_last_error: null,
        posts_last_error_at: null,
        ...(opts?.scheduled ? { posts_last_scheduled_run_at: now } : {}),
      })
      .eq("id", company.id);

    return insertedCount;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("companies")
      .update({ posts_last_fetched_at: now, posts_last_error: message, posts_last_error_at: now })
      .eq("id", company.id);
    throw err;
  }
}
