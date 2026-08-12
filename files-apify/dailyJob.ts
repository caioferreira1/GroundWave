/**
 * dailyJob.ts
 * -----------------------------------------------------------------------------
 * Job diário: lê a config (do banco), roda a coleta, deduplica, salva os posts
 * e registra o custo do run + o uso da conta.
 *
 * Instale as deps:
 *   npm i node-cron
 *   npm i -D @types/node-cron
 */

import cron from "node-cron";
import {
  runRedditScrape,
  dedupePosts,
  getAccountUsage,
  formatUsageBadge,
  type RedditPost,
  type RedditSearchConfig,
  type RunStats,
} from "./redditApify";

// -----------------------------------------------------------------------------
// Config — TUDO configurável pela sua UI; aqui vem do banco.
// -----------------------------------------------------------------------------
async function loadConfig(): Promise<RedditSearchConfig> {
  // TODO: ler do banco a config que a UI gravou (keywords, subreddits, etc.).
  // Este retorno é só um fallback/exemplo.
  return {
    keywords: [
      "meta-analysis",
      "systematic review",
      "research",
      "publications",
      "PubMed",
      "first author",
      "research experience",
      "residency application",
      "how to publish",
      "research productivity",
    ],
    subreddits: ["medicalschool", "IMGreddit", "Residency", "premed", "MedicalSchoolUK"],
    maxPosts: 50,
    time: "day",
    sort: "new",
  };
}

// -----------------------------------------------------------------------------
// Persistência — troque estes stubs pela sua camada de banco.
// -----------------------------------------------------------------------------

/** Carregue os ids já processados (ex.: SELECT id FROM reddit_posts). */
async function loadSeenIds(): Promise<Set<string>> {
  // TODO
  return new Set<string>();
}

/** Salve os posts novos (ex.: INSERT ... ON CONFLICT (id) DO NOTHING). */
async function savePosts(posts: RedditPost[]): Promise<void> {
  // TODO
  console.log(`salvando ${posts.length} posts...`);
}

/** Registre o custo de cada run (ex.: tabela apify_runs) pra mostrar no app. */
async function saveRunStats(stats: RunStats): Promise<void> {
  // TODO: INSERT INTO apify_runs (run_id, cost_usd, item_count, finished_at) ...
  console.log(`run ${stats.runId}: $${stats.costUsd.toFixed(2)} · ${stats.itemCount} posts`);
}

// -----------------------------------------------------------------------------
// O job em si
// -----------------------------------------------------------------------------
export async function runDailyCollection(): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    const config = await loadConfig();
    const seenIds = await loadSeenIds();

    const { posts, run } = await runRedditScrape(config);
    const fresh = dedupePosts(posts, seenIds);

    await saveRunStats(run);
    if (fresh.length) await savePosts(fresh);

    // Uso da conta pra exibição discreta (log aqui; no app vem via endpoint).
    const usage = await getAccountUsage();
    console.log(`[${startedAt}] ${formatUsageBadge(run, usage)} · novos=${fresh.length}`);
  } catch (err) {
    // Não deixe o job derrubar o processo — logue e siga pro próximo dia.
    console.error(`[${startedAt}] job falhou:`, err);
  }
}

// -----------------------------------------------------------------------------
// Agendamento: todo dia às 08:00 no fuso de São Paulo.
// -----------------------------------------------------------------------------
cron.schedule("0 8 * * *", runDailyCollection, { timezone: "America/Sao_Paulo" });

// Dispara uma vez na subida do processo (útil pra testar). Remova em produção
// se quiser rodar SÓ no horário agendado.
if (process.env.RUN_ON_START === "true") {
  void runDailyCollection();
}
