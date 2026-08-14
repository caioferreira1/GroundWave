import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyPost } from "@/lib/ai/classifier";
import {
  ApifyRunError,
  parseRunResult,
  startRedditRun,
  type ApifyRunResource,
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

const INGEST_COMPANY_COLUMNS =
  "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_time_window, posts_max_per_run";

export async function loadIngestCompany(companyId: string): Promise<IngestCompany | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select(INGEST_COMPANY_COLUMNS)
    .eq("id", companyId)
    .maybeSingle();
  return data as IngestCompany | null;
}

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

type ApifyRunRowStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | "TIMEOUT_CLIENT";

type ApifyRunRowPatch = {
  dataset_id: string | null;
  status: ApifyRunRowStatus;
  cost_usd: number;
  compute_units: number;
  item_count: number;
  run_time_secs: number;
  error: string | null;
  finished_at: string | null;
};

async function updateApifyRun(runId: string, patch: ApifyRunRowPatch): Promise<void> {
  const admin = createAdminClient();
  await admin.from("apify_runs").update(patch).eq("run_id", runId);
}

function statsToRowPatch(run: ApifyRunStats, error: string | null): ApifyRunRowPatch {
  return {
    dataset_id: run.datasetId,
    status: run.status as ApifyRunRowStatus,
    cost_usd: run.costUsd,
    compute_units: run.computeUnits,
    item_count: run.itemCount,
    run_time_secs: run.runTimeSecs,
    error,
    finished_at: run.finishedAt,
  };
}

/**
 * Starts an Apify run for one company (fire-and-forget — does NOT wait for
 * it to finish; a real run can take several minutes) and records a
 * `RUNNING` row in `apify_runs`. The actual posts/cost land later, when
 * Apify calls `webhookUrl` and `completeCompanyIngestion` below runs.
 *
 * `webhookUrl` must be publicly reachable (Apify can't call back into
 * localhost) — callers build it from the incoming request's host.
 *
 * `posts_last_scheduled_run_at` (which gates the cron "due" check) is
 * stamped here, at dispatch, not at completion — it marks the schedule
 * slot as consumed regardless of how long the run itself takes.
 */
export async function dispatchCompanyIngestion(
  company: IngestCompany,
  webhookUrl: string,
  opts?: { scheduled?: boolean },
): Promise<{ runId: string } | { skipped: true }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const scheduled = opts?.scheduled ?? false;

  try {
    const started = await startRedditRun(
      {
        keywords: company.search_keywords ?? [],
        subreddits: company.suggested_subreddits ?? [],
        maxPosts: company.posts_max_per_run ?? 100,
        time: (company.posts_time_window ?? "day") as ApifyTimeWindow,
        sort: (company.posts_sort ?? "new") as ApifySort,
      },
      webhookUrl,
    );

    if (!started) {
      // No keywords/subreddits configured — nothing to search, no run to wait on.
      await admin
        .from("companies")
        .update({
          posts_last_fetched_at: now,
          posts_last_error: null,
          posts_last_error_at: null,
          ...(scheduled ? { posts_last_scheduled_run_at: now } : {}),
        })
        .eq("id", company.id);
      return { skipped: true };
    }

    const { error: insertError } = await admin.from("apify_runs").insert({
      company_id: company.id,
      run_id: started.runId,
      status: "RUNNING" as ApifyRunRowStatus,
      scheduled,
      started_at: started.startedAt,
    });
    if (insertError) {
      // The Apify run is already live at this point (real cost/credits
      // spent) but untracked — its webhook will arrive to an unknown
      // run_id and be dropped. Surface loudly rather than losing it silently.
      throw new Error(`Apify run ${started.runId} started but failed to record in apify_runs: ${insertError.message}`);
    }

    if (scheduled) {
      await admin.from("companies").update({ posts_last_scheduled_run_at: now }).eq("id", company.id);
    }

    return { runId: started.runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("companies")
      .update({ posts_last_fetched_at: now, posts_last_error: message, posts_last_error_at: now })
      .eq("id", company.id);
    throw err;
  }
}

/**
 * Called from the Apify webhook once a dispatched run reaches a terminal
 * state. Loads the company's current filter settings fresh (they may have
 * changed since dispatch), fetches + filters + ingests the posts, and
 * updates both the `apify_runs` row and the company's last-fetch bookkeeping.
 */
export async function completeCompanyIngestion(companyId: string, resource: ApifyRunResource): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const company = await loadIngestCompany(companyId);
  if (!company) return; // company deleted between dispatch and completion

  try {
    const { posts, run } = await parseRunResult(resource);

    const timeWindow = (company.posts_time_window ?? "day") as ApifyTimeWindow;
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

    await insertAndClassifyPosts(companyId, candidates);
    await updateApifyRun(run.runId, statsToRowPatch(run, null));

    await admin
      .from("companies")
      .update({ posts_last_fetched_at: now, posts_last_error: null, posts_last_error_at: null })
      .eq("id", companyId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ApifyRunError) {
      await updateApifyRun(err.stats.runId, statsToRowPatch(err.stats, message));
    } else {
      // The Apify run itself finished fine (parseRunResult succeeded) but
      // something downstream — insert/classify — threw. Still must clear
      // RUNNING here or this row blocks every future "Run ingestion now"
      // click for this company forever (see actions.ts::runIngestionNow).
      await updateApifyRun(resource.id, {
        dataset_id: resource.defaultDatasetId ?? null,
        status: (resource.status as ApifyRunRowStatus) || "FAILED",
        cost_usd: resource.usageTotalUsd ?? 0,
        compute_units: resource.stats?.computeUnits ?? 0,
        item_count: 0,
        run_time_secs: resource.stats?.runTimeSecs ?? 0,
        error: message,
        finished_at: resource.finishedAt ?? now,
      });
    }
    await admin
      .from("companies")
      .update({ posts_last_fetched_at: now, posts_last_error: message, posts_last_error_at: now })
      .eq("id", companyId);
  }
}
