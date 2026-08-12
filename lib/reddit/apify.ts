import "server-only";

/**
 * Reddit search backed by the Apify actor `harshmaur/reddit-scraper`,
 * replacing the old RapidAPI (`reddit34.p.rapidapi.com`) adapter.
 *
 * The actor's own keyword-search fields (`searchTerms`/`withinCommunity`/
 * `searchSort`/`searchTime`) only restrict to a SINGLE subreddit at a time
 * and don't apply to direct URLs. So instead we build real Reddit
 * multireddit search URLs ourselves (one per keyword, each covering every
 * configured subreddit) and pass them via `startUrls` — this is the only
 * way to get "these keywords, across all these subreddits" in one run.
 */

const APIFY_BASE = "https://api.apify.com/v2";
// No path da REST API o ID do actor usa "~" no lugar da "/".
const ACTOR_ID = "harshmaur~reddit-scraper";
const DATASET_FIELDS =
  "id,title,body,authorName,communityName,createdAt,upVotes,commentsCount,flair,postUrl,dataType";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
// Budget under Vercel's Fluid Compute ceiling (300s on Hobby), leaving room
// for the start-run POST + final dataset fetch + DB writes in the same request.
const DEFAULT_MAX_WAIT_SECS = 260;

export type NormalizedRedditPost = {
  author: string;
  url: string;
  content: string;
  subreddit: string;
  upvotes: number;
  posted_at: string;
};

export type ApifyTimeWindow = "hour" | "day" | "week" | "month" | "year" | "all";
export type ApifySort = "relevance" | "hot" | "top" | "new" | "comments";

export type ApifySearchConfig = {
  keywords: string[];
  subreddits: string[];
  maxPosts: number;
  time: ApifyTimeWindow;
  sort: ApifySort;
};

/** Metrics for ONE run — persisted to `apify_runs` for cost auditability. */
export type ApifyRunStats = {
  runId: string;
  datasetId: string | null;
  status: string;
  costUsd: number;
  computeUnits: number;
  itemCount: number;
  runTimeSecs: number;
  startedAt: string;
  finishedAt: string | null;
};

export type ApifySearchResult = { posts: NormalizedRedditPost[]; run: ApifyRunStats };

/** Shape of the `data` object in Apify's run endpoints — only the fields we read. */
type ApifyRunObject = {
  id: string;
  status: string;
  defaultDatasetId?: string;
  usageTotalUsd?: number;
  stats?: { computeUnits?: number; runTimeSecs?: number };
  startedAt: string;
  finishedAt?: string | null;
};

/** Account-wide spend for the current billing cycle (for a discreet usage badge). */
export type ApifyAccountUsage = {
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  cycleStart: string;
  cycleEnd: string;
};

/**
 * Thrown when a run reaches a non-SUCCEEDED terminal state, or our own
 * client-side wait deadline expires. Always carries whatever stats we have
 * so the caller can still record a failed run (Apify bills partial work).
 */
export class ApifyRunError extends Error {
  constructor(
    message: string,
    public readonly stats: ApifyRunStats,
  ) {
    super(message);
    this.name = "ApifyRunError";
  }
}

function emptyRunStats(): ApifyRunStats {
  return {
    runId: "",
    datasetId: null,
    status: "SKIPPED",
    costUsd: 0,
    computeUnits: 0,
    itemCount: 0,
    runTimeSecs: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

/**
 * One URL per keyword, each covering ALL subreddits via Reddit's native
 * multireddit search syntax: `r/sub1+sub2+.../search?q=...&restrict_sr=1`.
 * n(urls) = n(keywords) — the actor's `maxPostsCount` cap is shared across
 * every one of these URLs combined, not per-URL.
 */
export function buildApifySearchUrls(
  config: Pick<ApifySearchConfig, "keywords" | "subreddits" | "time" | "sort">,
): string[] {
  const { keywords, subreddits, time, sort } = config;
  const kw = keywords.map((k) => k.trim()).filter(Boolean);
  const multi = subreddits
    .map((s) => s.replace(/^\/?r\//i, "").trim())
    .filter(Boolean)
    .join("+");

  if (!multi || !kw.length) return [];

  return kw.map(
    (k) =>
      `https://www.reddit.com/r/${multi}/search/?q=${encodeURIComponent(k)}&restrict_sr=1&sort=${sort}&t=${time}`,
  );
}

function requireToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not configured.");
  return token;
}

async function apifyGet<T>(path: string, token: string, timeoutMs = 30_000): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY_BASE}${path}${sep}token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Apify GET ${path} failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

/** Polls (server-side long-poll via `waitForFinish`) until a terminal status. */
async function waitForRun(
  runId: string,
  token: string,
  maxWaitSecs = DEFAULT_MAX_WAIT_SECS,
): Promise<ApifyRunObject> {
  const deadline = Date.now() + maxWaitSecs * 1000;
  for (;;) {
    const { data: run } = await apifyGet<{ data: ApifyRunObject }>(
      `/actor-runs/${runId}?waitForFinish=60`,
      token,
      70_000,
    );
    if (TERMINAL.has(run.status)) return run;
    if (Date.now() > deadline) {
      throw new ApifyRunError(`Run ${runId} did not finish within ${maxWaitSecs}s (status: ${run.status}).`, {
        runId,
        datasetId: run.defaultDatasetId ?? null,
        status: "TIMEOUT_CLIENT",
        costUsd: run.usageTotalUsd ?? 0,
        computeUnits: run.stats?.computeUnits ?? 0,
        itemCount: 0,
        runTimeSecs: run.stats?.runTimeSecs ?? 0,
        startedAt: run.startedAt,
        finishedAt: null,
      });
    }
  }
}

function normalizeItem(item: Record<string, unknown>): NormalizedRedditPost | null {
  // The actor's output schema also carries comment-shaped fields; even with
  // searchComments:false, filter defensively on dataType when present.
  if (item.dataType && item.dataType !== "post") return null;

  const url = typeof item.postUrl === "string" ? item.postUrl : "";
  const title = typeof item.title === "string" ? item.title : "";
  const body = typeof item.body === "string" ? item.body : "";
  const content = [title, body].filter(Boolean).join("\n\n").slice(0, 20_000);
  if (!url || !content) return null;

  const community = typeof item.communityName === "string" ? item.communityName : "";

  return {
    author: (item.authorName as string) || "[deleted]",
    url,
    content,
    subreddit: community.replace(/^r\//i, ""),
    upvotes: typeof item.upVotes === "number" ? item.upVotes : 0,
    posted_at: (item.createdAt as string) || new Date().toISOString(),
  };
}

/**
 * Async flow: start run -> poll to terminal -> fetch dataset items. Always
 * returns posts + the run's cost/usage stats so the caller can persist
 * both to `apify_runs`. Throws `ApifyRunError` (carrying `.stats`) on a
 * non-SUCCEEDED terminal status or client-side timeout; throws a plain
 * Error if the run couldn't even be started (no run id to record yet).
 */
export async function runRedditSearch(config: ApifySearchConfig): Promise<ApifySearchResult> {
  const urls = buildApifySearchUrls(config);
  if (urls.length === 0) return { posts: [], run: emptyRunStats() };

  const token = requireToken();

  const input = {
    startUrls: urls.map((url) => ({ url })),
    searchTerms: [],
    searchPosts: true,
    searchComments: false,
    maxPostsCount: config.maxPosts,
  };

  const startRes = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  if (!startRes.ok) {
    const detail = await startRes.text().catch(() => "");
    throw new Error(`Apify start-run failed (HTTP ${startRes.status}): ${detail.slice(0, 300)}`);
  }
  const { data: started } = (await startRes.json()) as { data: { id: string } };

  const run = await waitForRun(started.id, token);
  const stats: ApifyRunStats = {
    runId: run.id,
    datasetId: run.defaultDatasetId ?? null,
    status: run.status,
    costUsd: run.usageTotalUsd ?? 0,
    computeUnits: run.stats?.computeUnits ?? 0,
    itemCount: 0,
    runTimeSecs: run.stats?.runTimeSecs ?? 0,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };
  if (run.status !== "SUCCEEDED") {
    throw new ApifyRunError(`Apify run ended with status ${run.status}.`, stats);
  }

  const items = await apifyGet<Record<string, unknown>[]>(
    `/datasets/${run.defaultDatasetId}/items?fields=${DATASET_FIELDS}&clean=true&format=json`,
    token,
  );
  const posts = items.map(normalizeItem).filter((p): p is NormalizedRedditPost => p !== null);

  return { posts, run: { ...stats, itemCount: posts.length } };
}

type ApifyLimitsResponse = {
  data: {
    current?: { monthlyUsageUsd?: number };
    limits?: { maxMonthlyUsageUsd?: number };
    monthlyUsageCycle?: { startAt?: string; endAt?: string };
  };
};

/** Account spend/limit for the current monthly cycle (for a discreet usage badge). */
export async function getApifyAccountUsage(): Promise<ApifyAccountUsage> {
  const token = requireToken();
  const { data } = await apifyGet<ApifyLimitsResponse>("/users/me/limits", token);

  const spentUsd = Number(data.current?.monthlyUsageUsd ?? 0);
  const limitUsd = Number(data.limits?.maxMonthlyUsageUsd ?? 0);

  return {
    spentUsd,
    limitUsd,
    remainingUsd: limitUsd ? Math.max(0, limitUsd - spentUsd) : 0,
    cycleStart: data.monthlyUsageCycle?.startAt ?? "",
    cycleEnd: data.monthlyUsageCycle?.endAt ?? "",
  };
}
