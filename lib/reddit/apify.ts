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
 *
 * Fully async: `startRedditRun` only dispatches the actor run (with an
 * ad-hoc webhook attached) and returns immediately — a real run can take
 * several minutes (confirmed live: ~4min for 5 keywords x 5 subreddits),
 * far past what's safe to hold a Vercel function open for. The webhook
 * handler (app/api/webhooks/apify-run-complete) calls `parseRunResult`
 * once Apify posts back the finished run.
 */

const APIFY_BASE = "https://api.apify.com/v2";
// No path da REST API o ID do actor usa "~" no lugar da "/".
const ACTOR_ID = "harshmaur~reddit-scraper";
const DATASET_FIELDS =
  "id,title,body,authorName,communityName,createdAt,upVotes,commentsCount,flair,postUrl,dataType";

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

/**
 * Shape of the `resource` object Apify sends in the webhook payload (and
 * what `GET /actor-runs/{id}` returns) — only the fields we read.
 */
export type ApifyRunResource = {
  id: string;
  status: string;
  defaultDatasetId?: string | null;
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
 * Thrown when a run's resource reports a non-SUCCEEDED terminal status.
 * Always carries whatever stats we have so the caller can still record a
 * failed run (Apify bills partial work even on FAILED/ABORTED/TIMED-OUT).
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

/** Base64-encodes the ad-hoc webhook definition Apify expects on the `webhooks` query param. */
function buildWebhooksParam(webhookUrl: string): string {
  const definitions = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
      requestUrl: webhookUrl,
    },
  ];
  return Buffer.from(JSON.stringify(definitions)).toString("base64");
}

/**
 * Starts the actor run with an ad-hoc webhook attached (fires once the run
 * reaches a terminal state) and returns immediately — does NOT wait for the
 * run to finish. Returns `null` if the company has no keywords/subreddits
 * configured (nothing to search, no run started). `webhookUrl` must be a
 * publicly reachable URL — Apify can't call back into localhost.
 */
export async function startRedditRun(
  config: ApifySearchConfig,
  webhookUrl: string,
): Promise<{ runId: string; startedAt: string } | null> {
  const urls = buildApifySearchUrls(config);
  if (urls.length === 0) return null;

  const token = requireToken();

  const input = {
    startUrls: urls.map((url) => ({ url })),
    searchTerms: [],
    searchPosts: true,
    searchComments: false,
    maxPostsCount: config.maxPosts,
  };

  const webhooks = buildWebhooksParam(webhookUrl);
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${encodeURIComponent(token)}&webhooks=${encodeURIComponent(webhooks)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!startRes.ok) {
    const detail = await startRes.text().catch(() => "");
    throw new Error(`Apify start-run failed (HTTP ${startRes.status}): ${detail.slice(0, 300)}`);
  }
  const { data: started } = (await startRes.json()) as { data: { id: string; startedAt: string } };
  return { runId: started.id, startedAt: started.startedAt };
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
 * Given the (terminal) run resource from the webhook payload, fetches the
 * dataset items and returns normalized posts + stats. Throws `ApifyRunError`
 * (carrying `.stats`) if the run didn't end in SUCCEEDED — the webhook
 * fires for FAILED/ABORTED/TIMED-OUT too, and those still need a stats row.
 */
export async function parseRunResult(resource: ApifyRunResource): Promise<ApifySearchResult> {
  const stats: ApifyRunStats = {
    runId: resource.id,
    datasetId: resource.defaultDatasetId ?? null,
    status: resource.status,
    costUsd: resource.usageTotalUsd ?? 0,
    computeUnits: resource.stats?.computeUnits ?? 0,
    itemCount: 0,
    runTimeSecs: resource.stats?.runTimeSecs ?? 0,
    startedAt: resource.startedAt,
    finishedAt: resource.finishedAt ?? null,
  };
  if (resource.status !== "SUCCEEDED") {
    throw new ApifyRunError(`Apify run ended with status ${resource.status}.`, stats);
  }
  if (!resource.defaultDatasetId) {
    throw new ApifyRunError("Apify run succeeded but has no dataset id.", stats);
  }

  const token = requireToken();
  const items = await apifyGet<Record<string, unknown>[]>(
    `/datasets/${resource.defaultDatasetId}/items?fields=${DATASET_FIELDS}&clean=true&format=json`,
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
