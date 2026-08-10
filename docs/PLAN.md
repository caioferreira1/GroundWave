# GroundWave Hub — recomeço do zero (Next.js + Supabase próprio)

*Nome do produto: **GroundWave Hub** (renomeado durante a Fase 1 — antes
chamado "MAA Reddit Persona Engine" neste documento e no código; se algum
trecho abaixo ainda disser o nome antigo, é resquício).*

> Este arquivo é a cópia canônica do plano (antes vivia só em
> `~/.claude/plans/` local, por isso sumiu ao trocar de máquina). Ao
> retomar o projeto em qualquer computador, leia isto primeiro — a seção
> "Status atual" abaixo é para ser mantida atualizada conforme o trabalho
> avança.

## Status atual (ler isto primeiro se estiver retomando o projeto)

- ✅ **Fase 1 completa**: repo em `Ground Wave/maa-reddit-app`, código no
  GitHub (`caioferreira1/GroundWave`, branch `main`), deploy automático na
  Vercel (`https://maa-reddit-app.vercel.app`), Supabase próprio com as
  migrations aplicadas, auth + aprovação de staff + CRUD de empresa
  funcionando de ponta a ponta (testado).
- ✅ **Passo 0 (chave do Lovable AI Gateway) resolvido** — ver seção própria
  abaixo, não precisa revisitar.
- ✅ **Rebrand + design system aplicado** — ver seção "Marca e design"
  abaixo.
- ⏭️ **Próximo passo: Fase 2** (ingestão via RapidAPI + classificador de
  relevância) — ainda não começada.
- Detalhes completos de infra (URLs, IDs de projeto) na seção "Infra em
  produção" mais abaixo. Segredos (chaves, senhas, tokens) não ficam neste
  arquivo nem em memória — estão só em `.env.local` (local) e nas env vars da
  Vercel; se precisar deles de novo, pedir ao usuário ou puxar via
  `vercel env pull`.

## Contexto

O objetivo é um sistema multi-empresa que monitora o Reddit, filtra posts
relevantes por empresa, gera respostas e posts originais na voz da persona
certa, sempre com revisão humana antes de publicar. Existe hoje um app
(`gw dashboard/gwdashboard`, TanStack Start + Supabase, construído via Lovable)
que já faz ~80% disso em produção — mas o usuário decidiu recomeçar do zero
porque não gosta do frontend, considera o código desorganizado (lógica
duplicada entre features, types gerados desatualizados) e quer um Supabase
próprio, fora da gestão do Lovable Cloud.

**Esse app existente NÃO deve ser tocado** — fica como referência de
arquitetura e como backup, caso o recomeço não dê certo. Tudo abaixo foi
desenhado lendo o código dele (schema, prompts, políticas de RLS, fluxo de
aprovação) para aproveitar as decisões já validadas em produção, sem copiar o
código nem alterar nada nesse repositório.

O outro repositório envolvido, `MAA-personas/meta-analysis-personas/`
(`personas/*.md` + `CLAUDE.md`), também não vira código do app novo — continua
sendo o workspace de autoria de conteúdo. A única ponte é um script de import
que lê os `.md` de lá e grava no Supabase do app novo.

**Decisões já fechadas com o usuário**: hospedagem na Vercel, login por
email+senha, Supabase próprio (não Lovable Cloud), frontend novo em Next.js,
IA continua no Lovable AI Gateway (por causa do crédito/custo já contratado),
`fichas/*.md` não são importadas (só as `personas/*.md`, já sintetizadas),
modo "genérico" (sem empresa) precisa continuar existindo no gerador de posts
ao lado do modo por empresa.

## Passo 0 — chave do Lovable AI Gateway (RESOLVIDO)

Confirmado via o próprio agente do Lovable (perguntado diretamente, dentro do
projeto `GW-System`): a `LOVABLE_API_KEY` é uma secret **gerenciada e
mascarada** — não existe forma de ler o valor bruto, nem pelo dono do projeto,
nem pela UI, nem por API. "Modo direto" (o backend Next.js guardando a chave
ele mesmo) é portanto **impossível**, não só não-recomendado.

Caminho implementado — **modo proxy**, exatamente como previsto como fallback:

- Projeto Lovable dedicado: `GW-System`
  (`e80378c8-c03f-4300-8219-3530b0e5bea4`), conectado via MCP server do
  Lovable (`claude mcp add --transport http lovable https://mcp.lovable.dev/?src=settings`).
  Único propósito: segurar a `LOVABLE_API_KEY` e expor um proxy — não é o
  `gwdashboard` antigo, nem tem relação com ele.
- Endpoint público criado dentro do GW-System:
  `POST /api/public/ai-proxy` — exige header `X-Proxy-Secret`, repassa o body
  verbatim para `https://ai.gateway.lovable.dev/v1/chat/completions` usando a
  `LOVABLE_API_KEY` interna do projeto, devolve a resposta verbatim.
- Projeto publicado (`deploy_project` via MCP) para URL estável de produção:
  `https://eloquent-coder-bot.lovable.app/api/public/ai-proxy` (a URL de
  preview fica atrás de um gate de login do Lovable e não é alcançável
  externamente sem publicar).
- **Testado e confirmado de fora do Lovable** (via `curl` deste terminal e via
  `lib/ai/gateway.ts::callAiGateway()` do app novo): `200 OK`, resposta real do
  modelo.
- `maa-reddit-app/.env.local` já configurado com
  `AI_GATEWAY_MODE=proxy` + `AI_PROXY_URL` + `AI_PROXY_SECRET` (valor gerado
  localmente, também setado como secret `PROXY_SHARED_SECRET` no GW-System).
  `lib/ai/gateway.ts` já implementa os dois modos, sem precisar de mudança de
  código futura caso o modo direto vire viável um dia.

## Arquitetura

Next.js (App Router, TypeScript) + Supabase próprio (Postgres + Auth + RLS) +
Vercel (hosting + Cron). Dois clientes Supabase, mesmo padrão do app de
referência: um escopado por sessão do usuário (RLS aplica) para Server
Components/Actions, e um com service role (ignora RLS) só para o cron job e o
webhook de ingestão — nunca exposto a partir de uma ação disparada direto por
input de usuário sem checagem de staff antes.

```
app/
  (auth)/login/  (auth)/pending-approval/
  (dashboard)/
    companies/[companyId]/{overview,settings,personas,posts,post-generator}/
    generic-post-generator/
    admin/users/
  api/cron/reddit-ingest/route.ts      # Vercel Cron
  api/webhooks/posts/route.ts          # ingestão externa (Zapier/Make/n8n)
lib/
  supabase/{server.ts, admin.ts}
  ai/{gateway.ts, classifier.ts, reply-generator.ts, post-generator.ts}
  reddit/{search.ts, ingest.ts}
  personas.ts, auth.ts
scripts/import-personas.ts
supabase/migrations/0001..0009*.sql   (ver nomes reais na pasta — seção abaixo)
vercel.json
```

## Schema (migrations) — nomes reais dos arquivos já aplicados

Ordem final ficou diferente do rascunho original (`companies` teve que vir
antes de `client_companies`, que referencia a tabela por FK):

`0001_extensions_and_helpers.sql` — extensões + `set_updated_at()` trigger
genérico.

`0002_profiles_and_roles.sql` — auth/staff:
`profiles (id, email, display_name, job_title, status: pending|approved|denied)`,
`user_roles (user_id, role: admin|coworker|client, unique)`. Funções
`is_staff()`, `is_approved()`, `has_role()`. Trigger `handle_new_user()` cria
o profile automaticamente no signup; **bootstrap admin =
`caiomorgz@gmail.com`** (aprovado + role admin automaticamente).

`0003_companies.sql` — `companies`: `id, name, website_url, profile, favicon_url,
guardrails_md` (novo — regras fixas de marca injetadas em toda geração;
seed da MAA vem de `CLAUDE.md`, seções "Tom da marca" + "Disclaimers
obrigatórios"), `suggested_subreddits text[]`, `search_keywords text[]`,
`posts_min_upvotes`, `posts_fetch_frequency_hours`, `posts_fetch_hour_utc`,
`posts_sort`, `posts_max_per_run`, `posts_fetch_enabled`,
`posts_last_fetched_at`, `posts_last_error(_at)`, `posts_retry_pending`,
`inbound_webhook_token uuid default gen_random_uuid()` (token por empresa —
ver seção de ingestão, é uma correção de segurança em relação ao app de
referência, que usa um segredo global único pra todos os clientes).

`0004_client_companies.sql` — `client_companies (user_id, company_id, unique)`
— join de acesso somente leitura para clientes externos, e a função
`can_access_company()` (staff vê tudo, cliente só empresas vinculadas). Fica
depois de `companies` de propósito (FK).

`0005_personas.sql` — `personas`: `id, company_id, slug, display_name, content_md`
(corpo inteiro do markdown — Resumo até Guardrails, sem quebrar em colunas,
porque nenhum agente precisa filtrar por seção isolada), `based_on_fichas
text[]` (só rastreabilidade), `is_active`, unique `(company_id, slug)`.

`0006_posts.sql` — `posts`: `id, company_id, author, url, content, posted_at, upvotes,
subreddit, received_at, ai_status (pending|processed|failed), is_relevant,
relevance_score, ai_reasoning, ai_error, human_verdict, human_verdict_by/at,
generated_comment, generated_comment_persona_id, generated_comment_persona_
rationale, comment_generated_at, comment_posted_at, comment_posted_by`.
Também tem `unique (company_id, url)` pra dedupe na ingestão.

`0007_classifier_examples.sql` — `company_id, post_id, content,
correct_is_relevant` — few-shot de correções humanas pro classificador.

`0008_post_generations.sql` (substitui o `generated_posts` do app de
referência, que era escopado por usuário — aqui fica escopado por empresa e
visível pro time inteiro, não só quem criou): `company_id` (nullable = modo
genérico), `mode (company|generic)`, `persona_id`, `persona_rationale`,
`subreddit, theme, title, body`, `created_by`, `posted_at`, `posted_by`.

`0009_fix_handle_new_user_enum_cast.sql` — correção de bug real encontrado ao
testar: o `CASE WHEN` do trigger `handle_new_user` (migration 0002) não tinha
cast explícito pro enum `account_status`, quebrando todo signup com
"Database error creating new user". Corrigido com casts explícitos.

RLS em todas: staff (`is_staff()`) acesso total; clientes leitura via
`can_access_company()`. Padrão idêntico ao já validado no app de referência.

## Pipeline

**Ingestão** — dois caminhos, ambos gravam em `posts` com `ai_status='pending'`
e disparam o classificador:
- Cron da Vercel (`vercel.json`, `17 9 * * *` — 1x/dia, limite do plano
  Hobby, ver seção "Infra em produção") → `api/cron/reddit-ingest` →
  filtra empresas cuja `posts_fetch_frequency_hours` já venceu (porta a lógica
  de `reddit-search-run.ts` do app de referência) → busca no Reddit via
  RapidAPI (`reddit34.p.rapidapi.com`) usando `search_keywords` +
  `suggested_subreddits` da empresa.
- Webhook `api/webhooks/posts` para automações externas — autenticado por
  `inbound_webhook_token` **por empresa** (não um segredo global), mostrado na
  página de configurações de cada empresa com botão de regenerar.

**Classificador de relevância** (`lib/ai/classifier.ts`) — porta quase literal
de `ai-classifier.server.ts`: 3 gates (`on_topic`, `author_matches_audience`,
`has_active_intent`) + score 0-100, threshold 70, com few-shot de até 8
`classifier_examples` recentes da empresa. O `is_relevant` final é
recalculado no servidor a partir dos 3 gates + score — nunca confia no
booleano que o modelo devolve sozinho. Essa parte do app de referência é sólida
e não precisa de redesenho, só porte.

**Geração de resposta persona-aware** (`lib/ai/reply-generator.ts`) — uma
única chamada de IA: o prompt inclui o catálogo de personas ativas da empresa
(pequeno, poucas por empresa) + o post, e pede pro modelo escolher a persona
mais aderente E já escrever o comentário na voz dela, com justificativa curta
— resposta `{personaId, rationale, comment}`. Se o staff já escolheu a persona
manualmente (override), o prompt pula a etapa de escolha. `guardrails_md` da
empresa entra sempre que existir. Mesmo fluxo de revisão do app de
referência: rascunho editável → "marcar como postado" exige staff aprovado.

**Geração de posts** (`lib/ai/post-generator.ts`) — dois modos na mesma
função: genérico (sem empresa, subreddit aleatório de uma lista fixa, sem
persona — praticamente igual ao que já existe hoje) e por empresa (subreddit
sugerido da empresa, persona + guardrails igual ao fluxo de resposta). Grava
em `post_generations` com `mode` e `company_id` nullable.

## Import das personas

`scripts/import-personas.ts` (script único, não faz parte do runtime do app),
roda com `--company-id <uuid-da-maa> --dir <pasta personas/>`: lê cada `.md`
com `gray-matter`, `slug` do frontmatter vira coluna, corpo inteiro vira
`content_md`, `baseada_em` vira `based_on_fichas` (só rastreabilidade). Upsert
por `(company_id, slug)`, então pode rodar de novo com segurança depois de
editar os `.md` de origem. Usa o client admin (service role) — script de
operador, não fica exposto no app.

## Autenticação e aprovação de staff

Supabase Auth (email+senha) + `@supabase/ssr`. Signup cria `profiles` como
`pending`; página `/pending-approval` bloqueia acesso até um admin aprovar em
`/admin/users` (aprovar + atribuir role `admin`/`coworker`/`client`; `client`
também vincula a empresas via `client_companies`). "Staff" = aprovado + role
admin ou coworker — é essa checagem (não só RLS) que guarda edição de
empresas/personas e a ação de marcar como postado.

## Infra em produção (já configurado)

- GitHub: `caioferreira1/GroundWave` (branch `main`), Vercel conectado via git
  integration — todo push em `main` dispara deploy automático.
- Vercel: projeto `groundwave/maa-reddit-app`, env vars de produção/preview já
  configuradas (Supabase, AI proxy, `RAPIDAPI_HOST`, `CRON_SECRET`). URL:
  `https://maa-reddit-app.vercel.app`.
- **Limitação do plano Hobby**: cron só roda 1x/dia (`vercel.json` ajustado
  para `17 9 * * *`). Isso significa que `posts_fetch_frequency_hours` abaixo
  de 24h (as opções de 6h/12h que a UI de configurações vai oferecer, cf.
  app de referência) não vão de fato rodar mais que uma vez ao dia até fazer
  upgrade pro plano Pro. Não bloqueia nada agora, só vale saber.
- Supabase: projeto próprio (ref `xmfmouontuvegtkwwhbw`), migrations
  0001-0009 aplicadas (0009 corrige um bug real no trigger `handle_new_user` —
  `CASE WHEN` sem cast para o enum `account_status` quebrava todo signup).

## Marca e design (aplicado)

Produto renomeado para **GroundWave Hub** durante a Fase 1. Passei um design
system de verdade em vez de estilo neutro genérico:

- **Conceito**: "ground wave" = onda de rádio que se propaga rente à
  superfície pra alcançar mais longe — referência literal ao nome da empresa
  e ao produto (ouvir sinal em meio ao ruído do Reddit). O wordmark
  (`components/logo.tsx`) é um transmissor com arcos que curvam pra baixo até
  a linha de base, não um ícone de wifi/sinal genérico.
- **Cor**: paleta própria em `app/globals.css` (tokens `--bg`, `--surface`,
  `--ink`, `--accent` etc., com variante dark via `prefers-color-scheme`) —
  teal profundo (`#0E7C86`) como cor de marca sobre branco levemente frio
  (`#F5F7F7`, não cinza puro). Cores semânticas (`--good`/`--warning`/
  `--critical`) ficam deliberadamente separadas da cor de marca, usadas em
  badges de status.
- **Tipografia**: IBM Plex Sans (títulos/corpo) + IBM Plex Mono (dados —
  emails, IDs, tokens), via `next/font/google` em `app/layout.tsx`.
- **Componentes**: `components/ui.tsx` (`Button`, `Input`, `Label`, `Card`,
  `Badge`, `PageHeading`) — usar esses em vez de reescrever classes Tailwind
  soltas nas próximas telas (posts, personas, post-generator).
- Verificado com build+lint limpos e uma passada de screenshots via
  Playwright (login, empresas, detalhe de empresa, admin de usuários).

## Fases de construção

1. ✅ **Fundações** (completa) — Next.js + Supabase, migrations 0001-0004 +
   0009, login/aprovação, CRUD de empresa básico. Os geradores de
   perfil/keywords/subreddits por IA (`generateCompanyProfile` etc., portados
   de `company.functions.ts` do app de referência) **ainda não foram
   portados** — só o CRUD simples (nome/site) existe hoje. Entrega atual: dá
   pra logar, aprovar staff, cadastrar empresas manualmente.
2. **Ingestão + classificador** (próximo passo) — migrations 0006-0007, adaptador RapidAPI,
   rota de cron + webhook, classificador, lista de posts com filtros e
   correção humana. Entrega: posts da MAA chegam e são classificados.
3. **Personas + resposta persona-aware** — migration 0004 + script de import,
   UI de personas, gerador de resposta, fluxo de revisão/aprovação. Entrega: o
   fluxo principal ponta a ponta (post relevante → rascunho na voz certa →
   revisão humana → marcado como postado).
4. **Geração de posts** — migration 0007, os dois modos, UI de criação.
5. **Polimento (depois)** — notificações, dashboards/analytics (o app de
   referência tem gráficos de SLA/tendência que podem ser portados depois),
   credenciais de API por empresa, segunda empresa-piloto além da MAA.

## Verificação

- Passo 0: teste de `curl` retorna 200 com o modelo respondendo — sem isso,
  nada do resto funciona, é o primeiro checkpoint real.
- Fase 1: criar conta, confirmar que fica `pending`, aprovar via
  `caiomorgz@gmail.com` (admin bootstrap), criar a empresa MAA.
- Fase 2: rodar a rota de cron manualmente (ou o webhook com um post de
  teste) e conferir no Supabase que a linha aparece em `posts` com
  `ai_status='processed'` e `relevance_score` preenchido.
- Fase 3: rodar o script de import, conferir 4 personas na tabela; gerar uma
  resposta para um post relevante da MAA e conferir que o rascunho reflete a
  voz de uma das personas e que `generated_comment_persona_id` foi
  preenchido; testar também o override manual de persona.
- Fase 4: gerar um post no modo genérico e um no modo empresa, conferir
  `post_generations` com `mode`/`company_id`/`persona_id` corretos.

## Arquivos de referência mais importantes (não modificar, só consultar)

- `gw dashboard/gwdashboard/src/lib/ai-classifier.server.ts` — prompt do
  classificador de 3 gates.
- `gw dashboard/gwdashboard/src/lib/posts.functions.ts` (linhas ~79-211,
  ~313-359) — regras de geração de comentário humano e o padrão de
  marcar/desmarcar como postado com checagem de staff aprovado.
- `gw dashboard/gwdashboard/src/routes/api/public/hooks/reddit-search-run.ts`
  e `src/lib/reddit-ingest.server.ts` — lógica de "empresas devidas" e busca
  no Reddit via RapidAPI.
- `gw dashboard/gwdashboard/supabase/migrations/20260606222945_*.sql` —
  schema de auth/roles/RLS em que o `0002` novo se baseia.
- `MAA-personas/meta-analysis-personas/personas/*.md` e `CLAUDE.md` — forma
  exata das personas e texto-base para `companies.guardrails_md` da MAA.
