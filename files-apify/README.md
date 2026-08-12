# Coleta de posts do Reddit via Apify

Módulo de coleta em TypeScript: recebe keywords + subreddits, monta a busca no
formato multireddit e dispara o actor `harshmaur/reddit-scraper` no Apify,
devolvendo os posts **e o custo de cada run**. Também expõe o gasto/limite da
conta pra exibição discreta no app. Sem LLM nessa fase.

## Arquivos

- `redditApify.ts` — núcleo: `buildSearchUrls`, `runRedditScrape` (posts + custo),
  `getAccountUsage`, `formatUsageBadge`, `dedupePosts`.
- `dailyJob.ts` — job diário com `node-cron`, já registrando custo e uso.
- `usageRoute.ts` — endpoint Express de exemplo pro frontend mostrar o gasto.

## Setup

1. Node 18+ (usa `fetch` global).
2. Variável de ambiente com seu token do Apify (só no backend, nunca no front):
   ```
   APIFY_TOKEN=apify_api_xxx
   ```
3. Deps dos exemplos:
   ```
   npm i node-cron express
   npm i -D @types/node-cron @types/express
   ```

## Tudo é configurável pelo app

Nada de keywords, subreddits ou limites está fixo no núcleo — tudo passa pelo
objeto `RedditSearchConfig`:

```ts
interface RedditSearchConfig {
  keywords: string[];    // sua UI grava
  subreddits: string[];  // sua UI grava
  maxPosts?: number;     // teto global do run (padrão 20)
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
  sort?: "relevance" | "hot" | "top" | "new" | "comments";
}
```

No `dailyJob.ts`, a função `loadConfig()` é onde você lê essa config do seu
banco (o que a UI gravou). O exemplo hardcoded ali é só um fallback.

## Uso mínimo

```ts
import { runRedditScrape, getAccountUsage, formatUsageBadge } from "./redditApify";

const { posts, run } = await runRedditScrape({
  keywords: ["meta-analysis", "systematic review"],
  subreddits: ["medicalschool", "IMGreddit"],
  maxPosts: 20,
  time: "day",
  sort: "new",
});

console.log(posts.length, "posts");
console.log("custo do run: $" + run.costUsd.toFixed(2));

const usage = await getAccountUsage();
console.log(formatUsageBadge(run, usage)); // "Run: $0.04 · Mês: $12.30 / $50.00"
```

## Custo e limites (o que aparece no app)

- **Custo por run:** vem em `run.costUsd` (campo `usageTotalUsd` do run no Apify).
  Salve numa tabela sua (`apify_runs`) pra ter histórico.
- **Gasto/limite da conta:** `getAccountUsage()` chama `/v2/users/me/limits` e
  devolve `spentUsd` (gasto no ciclo), `limitUsd` (teto mensal) e `remainingUsd`.
- **Exibição discreta:** o `usageRoute.ts` expõe `GET /api/apify-usage`; o
  frontend renderiza algo como um rodapé "Apify: $12.30 / $50.00 este mês".

## Como a busca é montada

- Cada **keyword** vira uma URL cobrindo **todos os subreddits** de uma vez:
  `https://www.reddit.com/r/sub1+sub2+.../search/?q=KEYWORD&restrict_sr=1&sort=new&t=day`
- Portanto: **nº de URLs = nº de keywords** (não de subreddits).

## Limitações que valem lembrar

- **Sem teto por subreddit.** O actor só tem um teto global (`maxPosts`). No
  formato multireddit os subs vêm num fluxo único e misturado, então um sub mais
  movimentado pode dominar. Pra "N por subreddit", troque pelo actor
  `parseforge/reddit-posts-scraper` (campo `postsPerSource`) — a interface do
  módulo pode continuar igual.
- **`t=day` é janela móvel de 24h**, não o dia-calendário. Rodando sempre no
  mesmo horário, a janela fica consistente.

## Dedup

`dedupePosts` evita repetir o mesmo lead entre dias. O `Set` de ids **precisa ser
persistido** (banco), não em memória — senão zera quando o processo reinicia. Uma
constraint `UNIQUE(id)` com `INSERT ... ON CONFLICT DO NOTHING` é o jeito robusto.

## Agendamento: duas opções

### A) Cron no seu processo (o que o `dailyJob.ts` faz)
Simples, mas exige um processo/servidor sempre no ar.

### B) Apify Scheduler + webhook (recomendado)
Sem servidor dedicado:
1. No painel do Apify, crie um **Schedule** (cron) apontando pro actor com o
   input já pronto (as `startUrls`).
2. Configure um **webhook** de "run succeeded" que faz `POST` pro endpoint do
   seu app com o `runId`/`datasetId`.
3. Seu app busca os itens e lê o custo do run (`usageTotalUsd`) via
   `GET /v2/actor-runs/{runId}`.

## Fluxo usado internamente

O módulo usa o fluxo assíncrono (dispara → espera → busca itens) justamente pra
capturar o custo do run, que o endpoint síncrono de "só itens" não retorna:
1. `POST /v2/acts/harshmaur~reddit-scraper/runs` (dispara).
2. `GET /v2/actor-runs/{runId}?waitForFinish=60` em loop até terminar.
3. `GET /v2/datasets/{datasetId}/items` pros posts.

## Próximo passo natural

Quando quiser a camada de inteligência, encaixe um passo entre `runRedditScrape`
e `savePosts` que manda os posts pra Anthropic API classificar e pontuar os
leads — sem mudar o resto do pipeline.
