import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyPost } from "@/lib/ai/classifier";
import {
  ApifyRunError,
  runRedditSearch,
  type ApifyRunStats,
  type ApifySort,
  type ApifyTimeWindow,
  type NormalizedRedditPost,
} from "@/lib/reddit/apify";

// sort=new mixes in some off-topic noise alongside fresh posts (see
// lib/reddit/apify.ts) — the AI classifier is what filters that noise for
// relevance. Recency, on the other hand, is reinforced here on top of the
// `t=` window already baked into the search URLs: cheap insurance against
// the actor's fast mode or Reddit's own moving-window imprecision, and it
// costs nothing since it only enforces the exact window already configured.
const WINDOW_MS: Record<string, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

function timeWindowCutoffMs(window: string): number | null {
  const ms = WINDOW_MS[window];
  return ms ? Date.now() - ms : null; // null for "all" (or unrecognized) => no filtering
}

export type IngestCompany = {
  id: string;
  suggested_subreddits: string[] | null;
  search_keywords: string[] | null;
  posts_min_upvotes: number | null;
  posts_sort?: string | null;
  posts_max_per_run?: number | null;
  posts_time_window?: string | null;
};

/**
 * Dedupes `candidates` against existing posts for the company (unique on
 * `(company_id, url)`), inserts the new ones as `ai_status:'pending'`, and
 * fires the AI classifier for each. Shared by both ingestion entry points —
 * the Apify-backed cron search and the external-automation webhook —
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
      .filter(
        (p): p is typeof p & { author: string; content: string; company_id: string } =>
          p.company_id !== null && p.author !== null && p.content !== null,
      )
      .map((p) => classifyPost(p)),
  );

  return inserted?.length ?? 0;
}

/** Persists one `apify_runs` row. Skipped entirely when no real run happened. */
async function recordApifyRun(
  companyId: string,
  run: ApifyRunStats,
  opts: { scheduled: boolean; error?: string },
): Promise<void> {
  if (!run.runId) return; // emptyRunStats() — company had no keywords/subreddits configured

  const admin = createAdminClient();
  await admin.from("apify_runs").insert({
    company_id: companyId,
    run_id: run.runId,
    dataset_id: run.datasetId,
    // By the time runId is non-empty, status is always one of the terminal
    // Apify statuses or our own "TIMEOUT_CLIENT" — never the placeholder
    // "SKIPPED" from emptyRunStats(), which returns above before this point.
    status: run.status as "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | "TIMEOUT_CLIENT",
    cost_usd: run.costUsd,
    compute_units: run.computeUnits,
    item_count: run.itemCount,
    run_time_secs: run.runTimeSecs,
    scheduled: opts.scheduled,
    error: opts.error ?? null,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
  });
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
  const scheduled = opts?.scheduled ?? false;
  const timeWindow = (company.posts_time_window ?? "day") as ApifyTimeWindow;

  try {
    const { posts, run } = await runRedditSearch({
      keywords: company.search_keywords ?? [],
      subreddits: company.suggested_subreddits ?? [],
      maxPosts: company.posts_max_per_run ?? 100,
      time: timeWindow,
      sort: (company.posts_sort ?? "new") as ApifySort,
    });

    const minUpvotes = company.posts_min_upvotes ?? 2;
    const maxPerRun = company.posts_max_per_run ?? 100;
    const maxAgeCutoff = timeWindowCutoffMs(timeWindow);
    // maxPostsCount already caps the actor's own output, but re-applying the
    // slice here is cheap insurance and keeps behavior identical if that
    // ever changes.
    const candidates = posts
      .filter((p) => p.upvotes >= minUpvotes)
      .filter((p) => maxAgeCutoff === null || new Date(p.posted_at).getTime() >= maxAgeCutoff)
      .slice(0, maxPerRun);

    const insertedCount = await insertAndClassifyPosts(company.id, candidates);
    await recordApifyRun(company.id, run, { scheduled });

    await admin
      .from("companies")
      .update({
        posts_last_fetched_at: now,
        posts_last_error: null,
        posts_last_error_at: null,
        ...(scheduled ? { posts_last_scheduled_run_at: now } : {}),
      })
      .eq("id", company.id);

    return insertedCount;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ApifyRunError) {
      await recordApifyRun(company.id, err.stats, { scheduled, error: message });
    }
    await admin
      .from("companies")
      .update({ posts_last_fetched_at: now, posts_last_error: message, posts_last_error_at: now })
      .eq("id", company.id);
    throw err;
  }
}
