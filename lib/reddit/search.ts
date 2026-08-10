import "server-only";

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "reddit34.p.rapidapi.com";

// Empirically confirmed against the live API (see docs/PLAN.md / plan history):
// a combined `(keywords) (subreddits)` query around 630 chars silently returns
// zero matches even though it's a valid request (success:true, posts:[]),
// while ~510 chars still works. Keeping a margin under the known-good size.
const MAX_QUERY_CHARS = 480;

export type NormalizedRedditPost = {
  author: string;
  url: string;
  content: string;
  subreddit: string;
  upvotes: number;
  posted_at: string;
};

interface RawRedditPostData {
  author?: string;
  title?: string;
  selftext?: string;
  permalink?: string;
  subreddit?: string;
  ups?: number;
  created_utc?: number;
}

function quoted(term: string): string {
  return `"${term.replace(/"/g, "")}"`;
}

/**
 * Builds a Reddit boolean search query: ("kw1" OR "kw2") (subreddit:a OR subreddit:b).
 * If the combined query is too long the live search silently returns zero
 * results, so subreddits are dropped from the end of the list until it fits
 * — keyword-only search has been confirmed to still work on its own.
 */
export function buildRedditQuery(keywords: string[], subreddits: string[]): string {
  const kw = keywords.map((k) => k.trim()).filter(Boolean);
  const subs = subreddits.map((s) => s.replace(/^r\//i, "").trim()).filter(Boolean);
  const kwGroup = kw.length ? `(${kw.map(quoted).join(" OR ")})` : "";

  for (let n = subs.length; n >= 0; n--) {
    const subGroup = n > 0 ? `(${subs.slice(0, n).map((s) => `subreddit:${s}`).join(" OR ")})` : "";
    const query = [kwGroup, subGroup].filter(Boolean).join(" ");
    if (query.length <= MAX_QUERY_CHARS || n === 0) {
      if (n < subs.length) {
        console.warn(
          `[buildRedditQuery] dropped ${subs.length - n} subreddit(s) to keep the query under ${MAX_QUERY_CHARS} chars`,
        );
      }
      return query;
    }
  }
  return kwGroup;
}

function isQuotaExceeded(status: number, body: string): boolean {
  return status === 429 || body.includes("exceeded the MONTHLY quota") || body.includes("exceeded the RATE limit");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SearchAttempt =
  | { ok: true; posts: NormalizedRedditPost[] }
  | { ok: false; quotaExceeded: boolean; reason: string };

async function attemptSearch(url: string, apiKey: string): Promise<SearchAttempt> {
  const res = await fetch(url, {
    headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, quotaExceeded: isQuotaExceeded(res.status, text), reason: `${res.status}: ${text.slice(0, 200)}` };
  }

  const json = (await res.json()) as {
    success: boolean;
    data?: { posts?: Array<{ data: RawRedditPostData }> } | string;
  };
  if (!json.success || typeof json.data === "string" || !json.data?.posts) {
    const reason = typeof json.data === "string" ? json.data : "unknown error";
    return { ok: false, quotaExceeded: isQuotaExceeded(200, reason), reason };
  }

  return {
    ok: true,
    posts: json.data.posts
      .map(({ data: d }) => ({
        author: d.author || "[deleted]",
        // `url` on link/image posts points at external media; the permalink is
        // always the actual Reddit thread, so build the canonical URL from it.
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : "",
        content: [d.title, d.selftext].filter(Boolean).join("\n\n").slice(0, 20000),
        subreddit: d.subreddit || "",
        upvotes: typeof d.ups === "number" ? d.ups : 0,
        posted_at: d.created_utc
          ? new Date(d.created_utc * 1000).toISOString()
          : new Date().toISOString(),
      }))
      .filter((p) => p.url && p.content),
  };
}

/**
 * Searches Reddit via RapidAPI. The endpoint rejects the `time` param unless
 * sort=top, so recency filtering is left to the caller (use `posted_at`)
 * instead of relying on a server-side time window.
 *
 * `sort` defaults to "relevance" rather than "new" — confirmed live that
 * "new" barely honors the boolean query (mostly unrelated recent posts),
 * while "relevance" reliably returns on-topic matches. The 3-gate AI
 * classifier downstream is what filters out the resulting stale/news-share
 * posts "relevance" tends to surface.
 */
export async function searchReddit(
  query: string,
  opts?: { sort?: "new" | "top" | "hot" | "relevance" },
): Promise<NormalizedRedditPost[]> {
  if (!query.trim()) return [];

  const keys = (process.env.RAPIDAPI_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) throw new Error("RAPIDAPI_KEYS is not configured.");

  const sort = opts?.sort ?? "relevance";
  const url = `https://${RAPIDAPI_HOST}/getSearchPosts?query=${encodeURIComponent(query)}&sort=${sort}`;

  let lastError: Error | null = null;
  for (const apiKey of keys) {
    // Confirmed live: the exact same request sometimes fails with a generic
    // "data not found" and succeeds moments later with nothing changed — the
    // endpoint itself is flaky, independent of quota or query shape. Retry a
    // couple of times on a real key before falling through to the next one.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await attemptSearch(url, apiKey);
      if (result.ok) return result.posts;

      lastError = new Error(
        result.quotaExceeded
          ? `RapidAPI key exhausted: ${result.reason}`
          : `RapidAPI reddit search failed: ${result.reason}`,
      );
      if (result.quotaExceeded) break; // no point retrying a dead key
      if (attempt < 3) await sleep(1500);
    }
  }

  throw lastError ?? new Error("RapidAPI reddit search failed: all keys exhausted");
}
