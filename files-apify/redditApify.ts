/**
 * redditApify.ts
 * -----------------------------------------------------------------------------
 * Camada de COLETA: monta a busca no Reddit (formato multireddit por URL),
 * dispara o actor `harshmaur/reddit-scraper` no Apify e devolve os posts +
 * o custo do run. Também expõe o uso/limite da conta pra exibição no app.
 *
 * Sem LLM aqui de propósito: montar a busca é 100% determinístico.
 *
 * Requer Node 18+ (usa `fetch` global). Token via variável de ambiente.
 */

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

export interface RedditSearchConfig {
  /** Palavras-chave. Cada keyword vira UMA URL cobrindo todos os subreddits. */
  keywords: string[];
  /** Subreddits SEM o "r/". Ex.: ["medicalschool", "IMGreddit"]. */
  subreddits: string[];
  /** Teto GLOBAL de posts no run (o actor não limita por subreddit). Padrão: 20. */
  maxPosts?: number;
  /** Janela de tempo. "day" = últimas 24h (janela móvel). Padrão: "day". */
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
  /** Ordenação da busca. Padrão: "new". */
  sort?: "relevance" | "hot" | "top" | "new" | "comments";
}

export interface RedditPost {
  id: string;
  title: string;
  body: string;
  authorName: string;
  communityName: string; // ex.: "r/medicalschool" — use pra reagrupar por sub
  createdAt: string;     // ISO 8601
  upVotes: number;
  commentsCount: number;
  flair: string | null;
  postUrl: string;
}

/** Métricas de UM run — o que você mostra de forma discreta no app. */
export interface RunStats {
  runId: string;
  datasetId: string;
  status: string;
  costUsd: number;      // usageTotalUsd — custo total do run em US$
  computeUnits: number; // stats.computeUnits
  itemCount: number;    // nº de posts retornados
  runTimeSecs: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface ScrapeResult {
  posts: RedditPost[];
  run: RunStats;
}

/** Uso da conta no ciclo mensal atual. */
export interface AccountUsage {
  spentUsd: number;     // current.monthlyUsageUsd
  limitUsd: number;     // limits.maxMonthlyUsageUsd (0 se sem teto definido)
  remainingUsd: number; // max(0, limit - spent)
  cycleStart: string;
  cycleEnd: string;
}

// ----------------------------------------------------------------------------
// Builder das URLs multireddit
// ----------------------------------------------------------------------------

/**
 * Gera uma URL de busca por keyword, cada uma cobrindo TODOS os subreddits
 * de uma vez via a sintaxe multireddit do Reddit (r/sub1+sub2+.../search).
 * Nº de URLs = nº de keywords. `restrict_sr=1` mantém a busca nesses subs.
 */
export function buildSearchUrls(config: RedditSearchConfig): string[] {
  const { keywords, subreddits, time = "day", sort = "new" } = config;

  if (!subreddits.length) throw new Error("Informe ao menos 1 subreddit.");
  if (!keywords.length) throw new Error("Informe ao menos 1 keyword.");

  const multi = subreddits
    .map((s) => s.replace(/^\/?r\//i, "").trim()) // aceita "r/x", "/r/x" ou "x"
    .filter(Boolean)
    .join("+");

  return keywords.map((kw) => {
    const q = encodeURIComponent(kw.trim());
    return `https://www.reddit.com/r/${multi}/search/?q=${q}&restrict_sr=1&sort=${sort}&t=${time}`;
  });
}

// ----------------------------------------------------------------------------
// Infra Apify
// ----------------------------------------------------------------------------

const APIFY_BASE = "https://api.apify.com/v2";
// No path da REST API o ID usa "~" no lugar da "/".
const ACTOR_ID = "harshmaur~reddit-scraper";

// Projeta só os campos úteis pra reduzir o payload.
const FIELDS = [
  "id",
  "title",
  "body",
  "authorName",
  "communityName",
  "createdAt",
  "upVotes",
  "commentsCount",
  "flair",
  "postUrl",
].join(",");

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

function requireToken(token: string | undefined): string {
  if (!token) throw new Error("APIFY_TOKEN não definido no ambiente.");
  return token;
}

async function apifyGet(path: string, token: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY_BASE}${path}${sep}token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Apify GET ${path} falhou (HTTP ${res.status}): ${detail}`);
  }
  return res.json();
}

/** Busca o objeto do run; `waitForFinish` segura a resposta no servidor (até 60s). */
async function getRun(runId: string, token: string, waitForFinishSecs = 0): Promise<any> {
  const wait = waitForFinishSecs ? `?waitForFinish=${waitForFinishSecs}` : "";
  const { data } = await apifyGet(`/actor-runs/${runId}${wait}`, token);
  return data;
}

/** Faz polling (com wait server-side) até o run atingir um status terminal. */
async function waitForRun(runId: string, token: string, maxWaitSecs = 300): Promise<any> {
  const deadline = Date.now() + maxWaitSecs * 1000;
  for (;;) {
    const run = await getRun(runId, token, 60);
    if (TERMINAL.has(run.status)) return run;
    if (Date.now() > deadline) {
      throw new Error(`Run ${runId} não terminou em ${maxWaitSecs}s (status: ${run.status}).`);
    }
  }
}

async function fetchDatasetItems(datasetId: string, token: string): Promise<RedditPost[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items` +
      `?token=${encodeURIComponent(token)}&fields=${FIELDS}&clean=true&format=json`
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Apify get-items falhou (HTTP ${res.status}): ${detail}`);
  }
  return (await res.json()) as RedditPost[];
}

// ----------------------------------------------------------------------------
// Rodar o scrape (fluxo assíncrono: dispara -> espera -> busca itens + custo)
// ----------------------------------------------------------------------------

export async function runRedditScrape(
  config: RedditSearchConfig,
  token: string | undefined = process.env.APIFY_TOKEN
): Promise<ScrapeResult> {
  const t = requireToken(token);

  const input = {
    startUrls: buildSearchUrls(config).map((url) => ({ url })),
    searchTerms: [],
    searchPosts: true,
    searchComments: false,
    maxPostsCount: config.maxPosts ?? 20,
  };

  // 1. Dispara o run (retorna na hora, status RUNNING).
  const startRes = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${encodeURIComponent(t)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    const detail = await startRes.text().catch(() => "");
    throw new Error(`Apify start-run falhou (HTTP ${startRes.status}): ${detail}`);
  }
  const started = (await startRes.json()).data;

  // 2. Espera terminar.
  const run = await waitForRun(started.id, t);
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Run terminou com status ${run.status}.`);
  }

  // 3. Busca os posts.
  const posts = await fetchDatasetItems(run.defaultDatasetId, t);

  const stats: RunStats = {
    runId: run.id,
    datasetId: run.defaultDatasetId,
    status: run.status,
    costUsd: run.usageTotalUsd ?? 0, // custo total do run em US$
    computeUnits: run.stats?.computeUnits ?? 0,
    itemCount: posts.length,
    runTimeSecs: run.stats?.runTimeSecs ?? 0,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };

  return { posts, run: stats };
}

// ----------------------------------------------------------------------------
// Uso / limite da conta (pra exibição discreta no app)
// ----------------------------------------------------------------------------

export async function getAccountUsage(
  token: string | undefined = process.env.APIFY_TOKEN
): Promise<AccountUsage> {
  const t = requireToken(token);
  const { data } = await apifyGet("/users/me/limits", t);

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

/** Linha curta pronta pra um rodapé/badge discreto. */
export function formatUsageBadge(run: RunStats, usage: AccountUsage): string {
  const money = (n: number) => `$${n.toFixed(2)}`;
  const limitPart = usage.limitUsd ? `${money(usage.spentUsd)} / ${money(usage.limitUsd)}` : money(usage.spentUsd);
  return `Run: ${money(run.costUsd)} · Mês: ${limitPart}`;
}

// ----------------------------------------------------------------------------
// Dedup por id (pra não repetir o mesmo lead entre dias)
// ----------------------------------------------------------------------------

/**
 * Filtra posts já vistos. `seenIds` deve ser PERSISTIDO (banco), não em memória,
 * pra sobreviver a reinícios do processo.
 */
export function dedupePosts(posts: RedditPost[], seenIds: Set<string>): RedditPost[] {
  const fresh: RedditPost[] = [];
  for (const p of posts) {
    if (p?.id && !seenIds.has(p.id)) {
      seenIds.add(p.id);
      fresh.push(p);
    }
  }
  return fresh;
}
