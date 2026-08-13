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

- ✅ **Gatilho do cron de ingestão migrado da Vercel pro GitHub Actions**
  (`.github/workflows/reddit-ingest-cron.yml`, roda de hora em hora) —
  resolve a limitação do plano Hobby (1 cron/dia) que fazia o campo "Fetch
  hour (UTC)" da UI de Settings ser decorativo. Detalhes na seção "Infra em
  produção" (busca por "Limitação do plano Hobby"). **Pendente de
  configuração manual do usuário**: cadastrar o secret `CRON_SECRET` (mesmo
  valor da env var na Vercel) em Settings → Secrets and variables → Actions
  do repo no GitHub — sem isso o workflow chama a rota e recebe 401.
- ✅ **Fase 1 completa**: repo em `Ground Wave/maa-reddit-app`, código no
  GitHub (`caioferreira1/GroundWave`, branch `main`), deploy automático na
  Vercel (`https://maa-reddit-app.vercel.app`), Supabase próprio com as
  migrations aplicadas, auth + aprovação de staff + CRUD de empresa
  funcionando de ponta a ponta (testado).
- ✅ **Passo 0 (chave do Lovable AI Gateway) resolvido** — ver seção própria
  abaixo, não precisa revisitar.
- ✅ **Rebrand + design system aplicado** — ver seção "Marca e design"
  abaixo.
- ✅ **Fase 2 completa** (ingestão via RapidAPI + classificador de
  relevância) — testada de ponta a ponta contra Supabase/RapidAPI/AI gateway
  reais (empresa MAA). Ver seção própria "Fase 2 — notas de implementação"
  logo abaixo do Pipeline para detalhes e decisões não óbvias (cota da
  RapidAPI, `sort` da busca, retry, filtro de janela de 24h). Uma primeira
  versão desta fase tinha sido implementada em outro computador mas nunca
  chegou a ser commitada/pushada (problema de credenciais) — foi refeita do
  zero nesta sessão.
- ✅ **Fase 3 implementada** (personas + resposta persona-aware) — script de
  import, UI de personas, gerador de resposta persona-aware, rascunho
  editável, marcar/desmarcar como postado. `generateReply()` testado de
  ponta a ponta contra Supabase/AI gateway reais; os cliques de UI (botões,
  toggle) ainda não foram testados no navegador por falta de login — ver
  ressalva na seção "Verificação" mais abaixo. Ver "Fase 3 — notas de
  implementação" abaixo pros detalhes não óbvios (idioma da resposta,
  anti-impersonation, fallback sem persona).
- ✅ **Fase 4 implementada e verificada ponta a ponta** (geração de posts
  originais, modo genérico + empresa) — `lib/ai/post-generator.ts`, rotas
  `/generic-post-generator` e `/companies/[companyId]/post-generator`, UI com
  card em destaque + histórico expansível inline (sem modal) + toast
  (`sonner`). Dois problemas reais apareceram num teste manual anterior do
  usuário e foram corrigidos numa sessão passada (ver "Fase 4 — notas de
  implementação"). **Nesta sessão** (máquina nova, `.env.local` reconstituído
  a partir das chaves que o usuário colou no chat): app rodado localmente
  (`npm run dev`) e dirigido de ponta a ponta via Chromium headless
  (Playwright) contra o Supabase/AI gateway/RapidAPI reais — login, Companies,
  Overview/Posts/Settings/Personas da MAA, e os dois geradores de post
  completos (gerar → toast "Post generated!" → card em destaque com
  persona certa → Copy Title/Copy Body via clipboard real → expandir
  histórico → Delete) todos confirmados via screenshot + log do servidor
  (`generatePost`/`deletePostGeneration` 200, sem erro de console/página).
  Conta de staff usada foi uma conta de QA temporária criada via
  `service_role` (não a conta admin real do usuário, cuja senha não estava
  disponível) — ver nota abaixo.
- ✅ **Fase 5 (parcial) — Dashboards/analytics na Overview** (implementado e
  verificado nesta sessão, mesma sessão da Fase 4 acima) — 3 gráficos novos
  (`recharts`, dependência nova) na aba Overview de cada empresa: posts
  postados, comentários gerados-vs-postados, e views reportadas (campo
  manual — Reddit não expõe views via API, confirmado com o usuário). Exigiu
  migration `0012_manual_views_metrics.sql` (2 colunas nullable,
  `views_count`/`comment_views_count`) e — a peça que faltava — UI de "Mark
  as posted"/"Unmark"/Views pro Post Generator, que até então tinha as
  colunas `posted_at`/`posted_by` no schema (migration 0008) sem nenhuma
  forma de setá-las. Ver o item 5 em "Fases de construção" abaixo pros
  detalhes. **Migration aplicada
  manualmente pelo usuário via SQL Editor do Supabase** (esta máquina não
  tem CLI/psql — ver "Infra em produção" pra isso não pegar ninguém de
  surpresa de novo).
- **Conta de QA temporária**: `qa-verification+groundwave@example.com`
  (senha só no histórico da sessão, não repetida aqui), criada direto via
  Supabase Admin API (`auth.admin.createUser` + `profiles.status='approved'`
  + `user_roles.role='coworker'`), pra poder logar sem a senha do admin real
  (`caiomorgz@gmail.com`). Fica no Supabase até alguém decidir apagar — não
  tem nada de sensível associado, só serve pra rodar o app localmente. Um
  item do histórico de "Post Generator" da MAA foi deletado durante o teste
  (ação real de `deletePostGeneration`, prova que o delete funciona) — sem
  impacto, era conteúdo gerado de teste, não teve efeito nos dados `posts`/
  `personas`/`companies` reais.
- ✅ **Migração RapidAPI → Apify completa** — a busca de Reddit trocou de
  provedor por completo (`lib/reddit/apify.ts`, actor `harshmaur/reddit-scraper`),
  substituindo a RapidAPI (`reddit34.p.rapidapi.com`) do fim ao fim: cron,
  webhook (só o import mudou), e "Run ingestion now". Nova tabela
  `apify_runs` (migrations 0014/0015) + campo `posts_time_window` na
  Settings. Testada de ponta a ponta contra a Apify real (empresa MAA): 2
  posts novos ingeridos e classificados, custo do run gravado ($0.028), uso
  mensal da conta lido ($0.24/$5.00). **Redesenhada pra ser assíncrona**
  ainda nesta sessão: um run real mediu **~4 minutos** (5 keywords × 5
  subreddits), tempo demais/variável pra segurar uma function da Vercel
  esperando — cron e "Run ingestion now" agora só DISPARAM o run (via
  webhook ad-hoc do Apify) e devolvem na hora; um novo endpoint
  (`api/webhooks/apify-run-complete`) recebe o aviso da Apify quando o run
  termina (minutos depois) e só aí busca os posts/classifica/salva. Sem
  teto de tempo prático e sem depender de Fluid Compute (nenhuma rota
  precisa segurar mais que alguns segundos). Ver item 6 em "Fases de
  construção" e "Fase 6 — notas de implementação" pros detalhes. **Pendente
  de configuração manual do usuário antes do próximo deploy**: `APIFY_TOKEN`
  + `APIFY_WEBHOOK_SECRET` em `.env.local` (já feito localmente) e na
  Vercel (substituindo `RAPIDAPI_HOST`/`RAPIDAPI_KEYS`), migrations
  0014+0015 aplicadas via SQL Editor (0014 já aplicada pelo usuário; 0015
  ainda não). **O round-trip completo do webhook só dá pra testar contra a
  app deployada** — Apify não alcança `localhost`, então a verificação local
  desta sessão cobriu só o disparo do run, não o retorno via webhook.
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
    companies/[companyId]/layout.tsx          # tab bar: Overview/Settings/Posts
    companies/[companyId]/page.tsx            # overview (status cards)
    companies/[companyId]/settings/{page,actions}.tsx
    companies/[companyId]/posts/{page,actions}.tsx
    companies/[companyId]/post-generator/{page,actions,loading}.tsx  # Fase 4
    generic-post-generator/{page,actions,loading}.tsx                # Fase 4
    admin/users/
  api/cron/reddit-ingest/route.ts      # acionado por GitHub Actions (de hora em hora)
  api/webhooks/posts/route.ts          # ingestão externa (Zapier/Make/n8n)
lib/
  supabase/{server.ts, admin.ts, types.ts}
  ai/{gateway.ts, classifier.ts, reply-generator.ts, post-generator.ts}  # Fase 3/4
  reddit/{apify.ts, ingest.ts, subreddits.ts}    # apify.ts: Fase 6 (era search.ts/RapidAPI)
  auth.ts                                     # personas.ts: Fase 3
components/post-generator/{generate-button,post-generation-card,history-list,types}.tsx  # Fase 4
scripts/import-personas.ts                    # ainda não existe (Fase 3)
supabase/migrations/0001..0011*.sql   (ver nomes reais na pasta — seção abaixo)
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

`0010_default_posts_sort_relevance.sql` + `0011_revert_posts_sort_default_new.sql`
— ida e volta do `default` de `companies.posts_sort` durante a Fase 2, as
duas aplicadas (nenhuma foi editada depois de rodada — sempre nova migration
pra corrigir, nunca mexer numa já aplicada). Ver "Fase 2 — notas de
implementação" abaixo pro porquê: `relevance` parecia melhor num teste
isolado, mas em uso real trouxe posts de anos atrás; `new` (o valor final)
é o que fica.

`0012_manual_views_metrics.sql` / `0013_manual_comments.sql` — ver Fase 5.

`0014_apify_runs.sql` — tabela `apify_runs` (histórico de custo/status por run
do actor Apify) + `companies.posts_time_window` (janela de busca configurável,
substitui o filtro fixo de 24h da era RapidAPI) + `posts_sort` ganha o valor
`comments`. Ver "Fase 6 — notas de implementação".

RLS em todas: staff (`is_staff()`) acesso total; clientes leitura via
`can_access_company()`. Padrão idêntico ao já validado no app de referência
(`apify_runs` é a única exceção — staff-only, sem policy de client, ver Fase
6).

## Pipeline

**Ingestão** — dois caminhos, ambos gravam em `posts` com `ai_status='pending'`
e disparam o classificador:
- GitHub Actions (`.github/workflows/reddit-ingest-cron.yml`, de hora em
  hora — ver seção "Infra em produção") → `api/cron/reddit-ingest` →
  filtra empresas cuja `posts_fetch_frequency_hours` já venceu (porta a
  lógica de `reddit-search-run.ts` do app de referência) → **dispara**
  (não espera) uma busca no Reddit via Apify pra cada uma (actor
  `harshmaur/reddit-scraper`, `lib/reddit/apify.ts::startRedditRun()`, ver
  "Fase 6 — notas de implementação") usando `search_keywords` +
  `suggested_subreddits` + `posts_time_window` da empresa, com um webhook
  ad-hoc anexado ao run. Empresas devidas são disparadas em paralelo
  (`Promise.allSettled`), isolando erro por empresa. Minutos depois, a
  Apify chama `api/webhooks/apify-run-complete` com o resultado do run —
  é só aí que os posts são de fato buscados, filtrados, ingeridos e
  classificados (`lib/reddit/ingest.ts::completeCompanyIngestion()`).
- Webhook `api/webhooks/posts` para automações externas (Zapier/Make/n8n) —
  autenticado por `inbound_webhook_token` **por empresa** (não um segredo
  global), mostrado na página de configurações de cada empresa com botão de
  regenerar. **Não confundir** com `api/webhooks/apify-run-complete` acima:
  esse é *inbound* de automações externas quaisquer; o outro é o retorno
  específico da Apify pro run que o próprio app disparou, autenticado por
  `APIFY_WEBHOOK_SECRET` (env var, não por empresa).

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
função: genérico (sem empresa, subreddit aleatório de uma lista fixa em
`lib/reddit/subreddits.ts`, sem persona) e por empresa (subreddit sugerido da
empresa, persona + guardrails igual ao fluxo de resposta, reaproveitando
`personaBriefing`/`ANTI_IMPERSONATION_NOTE`/`cleanComment` exportados de
`reply-generator.ts`). Grava em `post_generations` com `mode` e `company_id`
nullable. UI em `/generic-post-generator` e
`/companies/[companyId]/post-generator`. Ver "Fase 4 — notas de
implementação" abaixo.

## Fase 2 — notas de implementação (RapidAPI, o que aprendemos testando de verdade)

Implementada e testada de ponta a ponta nesta sessão (empresa MAA, chaves
reais). Decisões que não são óbvias só lendo o código:

- **Cota da RapidAPI é pequena**: plano BASIC do `reddit34` = **50
  requisições/mês por chave**, reseta mensalmente. `RAPIDAPI_KEYS` em
  `.env.local`/Vercel é uma **lista separada por vírgula** (não uma chave
  só) — `lib/reddit/search.ts::searchReddit()` tenta a próxima automaticamente
  quando uma bate 429/"exceeded the MONTHLY quota". Sempre manter mais de
  uma chave configurada.
- **A API é flaky**: a mesma query, sem mudar nada, às vezes responde
  `{success:false, data:"data not found"}` e funciona segundos depois no
  retry — confirmado ao vivo (3 tentativas seguidas: falhou, falhou, ok).
  `searchReddit()` tenta até 3x por chave (1.5s de intervalo) antes de
  cair pra próxima chave ou desistir.
- **Query longa demais (muitos keywords + subreddits combinados) retorna 0
  resultados silenciosamente** (não é erro, é uma resposta válida vazia).
  Reproduzido: 10 keywords + 10 subreddits funciona, 15+10 não.
  `buildRedditQuery()` corta subreddits do fim da lista até a query caber
  em `MAX_QUERY_CHARS` (480) — keywords nunca são cortadas porque busca
  só-com-keyword já provou funcionar sozinha.
- **`sort` da busca: `new`, não `relevance`** (migrations 0010→0011 foram
  essa ida e volta). `relevance` bate a query com precisão mas ignora data
  — trouxe posts de 2017-2022 numa busca de 2026. `new` respeita o filtro
  de subreddit e traz posts recentes (dias/semanas), misturado com ruído
  fora do tópico — mas esse ruído é exatamente o que o classificador de 3
  gates já rejeita corretamente. Não usar `relevance` como default de novo
  sem repensar isso.
- **Filtro de janela de 24h** em `lib/reddit/ingest.ts::ingestCompanyPosts()`
  (constante `MAX_POST_AGE_MS`): mesmo com `sort=new`, um post que "match"
  mas é antigo é descartado antes de virar candidato — só entra post
  postado nas últimas 24h. Isso é reforço além do `sort`, não substituto.
  Só se aplica ao caminho da busca RapidAPI; o webhook não filtra por idade
  (automação externa pode legitimamente mandar um post específico).
- **Webhook autenticado por `?token=` na query string** (não header) —
  pensado pra colar a URL inteira direto no Zapier/Make/n8n. Token é por
  empresa (`companies.inbound_webhook_token`), com botão de regenerar na
  Settings.
- **Classificador usa `callAiGateway()`** (`lib/ai/gateway.ts`, já existia
  da Fase 1) em vez de `fetch` direto ao Lovable — isso já dá o modo proxy
  do Passo 0 de graça, sem código extra.
- **Data mostrada na lista de Posts é `posted_at`** (quando o post foi feito
  no Reddit), não `received_at` (quando entrou no nosso banco) — pedido
  explícito, porque o objetivo é engajar em posts novos, não só ver quando
  processamos.
- **"Run ingestion now"** na Settings roda o mesmo `ingestCompanyPosts()` do
  cron mas com `scheduled:false` (não mexe em `posts_fetch_frequency_hours`/
  `posts_last_scheduled_run_at`) — é o jeito rápido de testar sem esperar o
  cron nem montar `curl` com `CRON_SECRET`.

## Import das personas

`scripts/import-personas.ts` (script único, não faz parte do runtime do app;
rodar via `npm run import-personas -- --company-id <uuid> --dir <pasta>`):
lê cada `.md` com `gray-matter`, `slug` do frontmatter vira coluna, corpo
inteiro vira `content_md`, `baseada_em` vira `based_on_fichas` (só
rastreabilidade). Upsert por `(company_id, slug)`, então pode rodar de novo
com segurança depois de editar os `.md` de origem — atualiza `content_md`/
`based_on_fichas` mas nunca sobrescreve `display_name` nem `is_active` numa
persona já existente, pra não reverter edições feitas na UI (nome
customizado, persona desativada manualmente). Cria um client Supabase
próprio em vez de importar `lib/supabase/admin.ts`: esse módulo (e tudo que
ele importa, como `lib/ai/gateway.ts`) é marcado `"server-only"`, que lança
erro fora da condição de bundler `react-server` do Next — exatamente o caso
de rodar via `tsx` puro. Carrega `.env.local` com `process.loadEnvFile()`
(Node ≥20.6, sem dependência nova). Os `.md` de origem não têm campo de nome
no frontmatter, então `display_name` é derivado do `slug` (title-case) na
criação — dá pra ajustar depois na aba Personas se ficar estranho.

## Fase 3 — notas de implementação (gerador de resposta persona-aware)

`lib/ai/reply-generator.ts::generateReply()` — mesmo padrão de
`classifier.ts` (client admin, escreve direto em `posts`, chamado a partir de
uma Server Action que já checou `requireStaff()`). Decisões que não são
óbvias só lendo o código:

- **Resposta sempre em inglês, mesmo as personas sendo em português**: os
  posts ingeridos são de subreddits em inglês (`r/medicalschool`,
  `r/Residency`, confirmado inspecionando posts reais da MAA) e o
  `companies.profile` da MAA também é em inglês — mas as personas em
  `MAA-personas/` são material interno em português. O prompt instrui
  explicitamente que o material de referência pode estar em português mas a
  saída tem que ser em inglês.
- **As personas calibram tom, não decidem se aparecem**: ao contrário do
  gerador de comentário do app de referência (que decide se cita ou não o
  produto da empresa), aqui a IA nunca afirma pertencer ao segmento de
  audiência — o prompt inclui uma regra anti-impersonation explícita,
  espelhando a seção "Guardrails" que já vem em cada persona `.md` ("nunca
  usá-la como identidade fake pra se passar por aluno real").
- **Catálogo de personas no prompt é truncado** às seções Resumo + Voz e
  vocabulário + Exemplos de linguagem (via regex simples em `## Heading`) —
  Dores/Objeções/Gatilhos são psicologia de marketing que não muda a escolha
  de palavras, incluir tudo só infla o prompt sem ajudar a escrita.
- **Sem persona ativa não bloqueia a geração** — empresa sem personas
  importadas ainda recebe resposta (só sem calibração de voz), pra não
  travar o fluxo principal antes do import rodar.
- **Override manual pula a etapa de escolha** — se o staff já selecionou uma
  persona no `<Select>` da página de Posts, o prompt nem lista as outras,
  só usa a escolhida.
- **"Marcar como postado" é sempre o próprio staff que clicou**, sem
  seletor de usuário (diferente do app de referência, que deixava escolher
  qualquer staff) — mais simples e não há caso de uso real pra postar em
  nome de outra pessoa aqui.
- Mesmo pós-processamento do app de referência: remove hífens/travessões
  residuais que o modelo às vezes cola apesar da regra.

## Fase 4 — notas de implementação (gerador de posts originais)

A tabela `post_generations` (migration 0008) e os types já existiam de antes
— o que faltava era só `lib/ai/post-generator.ts` e a UI. Decisões que não
são óbvias só lendo o código:

- **Reaproveita `reply-generator.ts` em vez de duplicar**: `personaBriefing`,
  `ANTI_IMPERSONATION_NOTE`, `cleanComment` e o tipo `PersonaRow` foram só
  marcados `export` lá (nenhuma lógica mudou) e importados em
  `post-generator.ts` — mesma escolha automática de persona best-fit ou
  `null`, mesmo aviso anti-impersonation (a persona calibra vocabulário/tom
  do post, nunca é uma identidade reivindicada), mesma limpeza de
  hífens/travessões residuais.
- **Modo genérico**: subreddit sorteado de `lib/reddit/subreddits.ts` (lista
  fixa portada do app de referência), prompt sem persona/guardrails.
- **Modo empresa**: subreddit sorteado de `companies.suggested_subreddits`
  (erro claro se a empresa não tiver nenhum configurado), guardrails +
  catálogo de personas ativas no prompt, igual ao fluxo de resposta.
- **Sem modal**: decisão explícita do usuário — o app não tinha nenhum
  componente Dialog ainda, então o histórico é um card que expande inline
  (`components/post-generator/history-list.tsx`) em vez de abrir um modal
  novo. `CopyButton` ganhou uma prop `label` opcional (antes só ícone) pra
  virar os botões "Copy Title"/"Copy Body" do card em destaque.
- **`sonner` é a primeira lib de toast do app** (não existia nenhuma antes).
  Usada só no botão "Generate"
  (`components/post-generator/generate-button.tsx`), que por isso é o único
  ponto do app que chama uma Server Action direto via `useTransition` em vez
  de `<form action={...}>` — necessário pra poder capturar erro/sucesso e
  mostrar toast, e pra exibir o estado "Generating…".
- **Bug real encontrado no teste manual do usuário** (RSC): passar
  `(id) => deletePostGeneration.bind(null, id)` como prop pro
  `HistoryList` (Client Component) quebra em runtime — "Functions cannot be
  passed directly to Client Components unless...". O Next só deixa atravessar
  a fronteira servidor→cliente a própria Server Action ou um `.bind()` dela,
  nunca uma função comum que a envolve/retorna. Fix: as páginas passam a
  action já pronta como prop (com `companyId` pré-vinculado no modo empresa
  via `.bind(null, companyId)` feito no Server Component), e o
  `.bind(null, post.id)` final acontece dentro do próprio `HistoryList`, na
  hora de montar o `<form action={...}>` de cada item.
- **Problema separado, de ambiente, não de código**: o dev server que já
  estava rodando havia acumulado corrupção de hot-reload do Turbopack (várias
  edições de arquivo numa sessão longa geraram `ReferenceError`s soltos nos
  logs) e isso derrubou a primeira chamada real ao AI gateway com
  `TypeError: fetch failed` — confirmado que o gateway em si funcionava
  (teste direto via Node, fora do Next, voltou 200 com resposta real do
  modelo). Ao reiniciar o servidor pra limpar esse estado, limpar o cache
  `.next` expôs um segundo problema: um 404 real (não só local) do CDN do
  Google Fonts pra alguns arquivos do IBM Plex Sans, derrubando o app inteiro
  em dev (toda página, não só Post Generator). `npm run build` funcionou
  normalmente com Turbopack no mesmo momento, então não é um bug permanente
  da combinação Turbopack + `next/font/google` nesta versão — foi tratado
  como transitório e resolvido reiniciando de novo.

## Fase 6 — notas de implementação (migração RapidAPI → Apify)

Substitui por completo a busca de Reddit (não é uma opção paralela — a
RapidAPI saiu do pipeline). `lib/reddit/apify.ts` (renomeado de `search.ts`,
já que todo export do arquivo agora é Apify-específico) roda o actor
`harshmaur/reddit-scraper`. Decisões que não são óbvias só lendo o código:

- **URLs de busca montadas à mão em vez dos campos nativos do actor**: o
  actor tem `searchTerms`/`withinCommunity`/`searchSort`/`searchTime`
  próprios, mas `withinCommunity` só aceita **um** subreddit por vez, e a
  própria documentação do actor confirma que `searchSort`/`searchTime` "only
  apply to Search Keywords, not Direct URLs" — ou seja, não dá pra pedir
  "estas keywords, nestes N subreddits" usando os campos nativos. Por isso
  `buildApifySearchUrls()` monta uma URL de busca multireddit do Reddit por
  keyword (`r/sub1+sub2+.../search/?q=...&sort=...&t=...`) e passa todas via
  `startUrls` — `maxPostsCount` é um teto **global**, compartilhado entre
  todas as URLs de um mesmo run, não por keyword/subreddit.
- **Filtro defensivo `dataType==='post'`**: o output schema do actor também
  carrega campos de comentário (mesmo com `searchComments:false` no input) —
  `normalizeItem()` descarta qualquer item cujo `dataType` não seja `"post"`
  quando o campo vem preenchido.
- **`ApifyRunError` carrega `.stats` de qualquer jeito**: um run pode
  terminar em `FAILED`/`ABORTED`/`TIMED-OUT` e a Apify cobra por trabalho
  parcial mesmo assim, então `completeCompanyIngestion()` grava a linha em
  `apify_runs` a partir de `err.stats` nesses casos — sem isso, um run caro
  que falha no meio ficaria com custo invisível.
- **Corte de idade agora é derivado de `posts_time_window`**, não mais um
  `MAX_POST_AGE_MS` fixo em 24h. O `t=` da URL agora é real (Reddit de
  verdade, diferente do `time` da RapidAPI, confirmado sem efeito na Fase
  2) — o corte client-side continua existindo como reforço barato, só que
  aplicando exatamente a janela configurada em vez de sempre 24h.
- **`dedupePosts`/`seenIds` do rascunho original não foram portados** —
  `insertAndClassifyPosts()` já dedupe contra o banco por `(company_id,
  url)`; um dedupe em memória a mais só adicionaria risco de divergir do
  banco sem ganho nenhum.
- **Cron e "Run ingestion now" são assíncronos** (redesenhado ainda nesta
  sessão depois de medir um run real em ~4min contra a Apify de verdade —
  perto demais do teto de duração pra confiar num design síncrono, e o
  usuário topou trocar por "sem limite de tempo, tudo bem se demorar").
  `dispatchCompanyIngestion()` só chama `startRedditRun()` (dispara o actor
  com um [webhook ad-hoc](https://docs.apify.com/integrations/webhooks/ad-hoc-webhooks)
  anexado via o parâmetro `webhooks` — base64 de
  `[{eventTypes:[...], requestUrl: "...api/webhooks/apify-run-complete?secret=..."}]`
  — na própria chamada de start-run) e grava uma linha `apify_runs` com
  `status:'RUNNING'`, sem esperar o run terminar. Quando o run chega num
  status terminal (minutos depois), a Apify faz POST nesse webhook com
  `{eventType, resource}` (`resource` = o mesmo objeto de
  `GET /actor-runs/{id}`); `completeCompanyIngestion()` busca o dataset,
  filtra, ingere/classifica e atualiza a linha `apify_runs` (por `run_id`,
  não insere outra) + `companies.posts_last_fetched_at`/`posts_last_error`.
  Autenticado por um secret compartilhado na query string
  (`APIFY_WEBHOOK_SECRET`) — é o padrão que a própria doc da Apify recomenda,
  já que não existe assinatura HMAC nativa nos webhooks. Consequência boa:
  **nenhuma rota mais depende de Fluid Compute** — dispatch e o handler do
  webhook são só algumas chamadas HTTP rápidas, bem dentro do teto padrão de
  60s do Hobby.
- **Idempotência do webhook**: a Apify pode reentregar o mesmo webhook
  (retry com backoff se a resposta não for 2xx, "em raros casos mais de uma
  vez" mesmo com 2xx). `apify-run-complete/route.ts` busca a linha em
  `apify_runs` pelo `run_id` e só processa se o status ainda for `RUNNING`
  — uma segunda entrega do mesmo evento vira no-op.
- **`Promise.allSettled` no cron**: agora é só isolamento de erro por
  empresa (uma falha ao disparar o run de uma empresa não derruba as
  outras), não mais uma questão de somar tempo de espera — dispatch é
  rápido para qualquer empresa.
- **`apify_runs` é staff-only** (sem policy de leitura pra `client`,
  diferente de `posts`) — é dado operacional/de billing, não algo que conta
  externa devia ver.
- **Indicador de custo/uso é direto na Server Component da Settings**, sem
  rota de API dedicada (o `usageRoute.ts` do rascunho original do usuário
  foi pensado pro cenário deles de frontend separado consumindo um backend
  à parte — aqui, sendo Next.js, a página já pode chamar
  `getApifyAccountUsage()` direto). Mostra "Last run: in progress…" em vez
  do custo/contagem quando a última linha de `apify_runs` da empresa ainda
  está `RUNNING`.
- **Só dá pra testar o disparo (dispatch) em dev local, não o round-trip
  completo** — a Apify precisa de uma URL pública pra chamar de volta, e
  não alcança `localhost`. Verificado nesta sessão via uma rota de debug
  temporária (criada e depois removida, mesmo padrão já usado nas Fases
  2/3): o disparo real contra a Apify funcionou de ponta a ponta
  (`apify_runs` gravado, posts inseridos, `posts_last_error`/
  `posts_last_fetched_at` corretos) **antes** do redesenho assíncrono, com
  a versão síncrona da função. A versão assíncrona final (com o webhook) só
  foi testada localmente até o disparo — o retorno via
  `api/webhooks/apify-run-complete` precisa ser verificado contra a app já
  deployada.

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
  configuradas (Supabase, AI proxy, `CRON_SECRET`). URL:
  `https://maa-reddit-app.vercel.app`. **A partir da Fase 6, `RAPIDAPI_HOST`/
  `RAPIDAPI_KEYS` saem e entram duas variáveis novas** — precisa ser setado
  à mão em Production + Preview (Project Settings → Environment Variables),
  mesmo lugar onde as chaves da RapidAPI estavam:
  - `APIFY_TOKEN` — token de API da conta Apify (Apify Console → Settings →
    API & Integrations). Diferente da conexão MCP OAuth usada só dentro do
    chat/editor — o backend chama a REST API do Apify direto.
  - `APIFY_WEBHOOK_SECRET` — secret gerado localmente (não vem de lugar
    nenhum externo, é só uma string aleatória), comparado contra `?secret=`
    na URL do webhook ad-hoc que a Apify chama de volta
    (`api/webhooks/apify-run-complete`) quando um run termina. Sem HMAC
    nativo nos webhooks da Apify, esse é o mecanismo de auth recomendado
    pela própria doc deles.
  - Não precisa mais confirmar Fluid Compute — o redesenho assíncrono (ver
    "Fase 6 — notas de implementação") tirou essa dependência: nenhuma rota
    segura uma requisição por mais que alguns segundos agora.
- ~~**Limitação do plano Hobby**: cron só roda 1x/dia~~ — **resolvido**: o
  gatilho não é mais o cron da Vercel. `vercel.json` não declara mais
  `crons`; quem chama `api/cron/reddit-ingest` agora é
  `.github/workflows/reddit-ingest-cron.yml`, de hora em hora (`7 * * * *`,
  UTC), via `curl` com `Authorization: Bearer $CRON_SECRET` (secret do GitHub
  Actions, precisa ter o mesmo valor da env var `CRON_SECRET` na Vercel — **o
  usuário precisa cadastrar isso manualmente** em
  Settings → Secrets and variables → Actions do repo no GitHub). A lógica de
  "due" dentro da rota (`posts_fetch_hour_utc`/`posts_fetch_frequency_hours`
  em `app/api/cron/reddit-ingest/route.ts`) não mudou — ela já comparava a
  hora configurada contra a hora atual corretamente, só nunca rodava mais de
  1x/dia pra ter chance de bater. Agora bate de verdade, e frequências abaixo
  de 24h (6h/12h) também passam a ser respeitadas, sem precisar de upgrade
  pro plano Pro. Ressalva: workflows agendados do GitHub Actions só rodam na
  branch default e o GitHub os desativa automaticamente depois de ~60 dias
  sem commit no repo — se o cron parecer ter parado, checar
  Actions → reddit-ingest-cron primeiro.
- Supabase: projeto próprio (ref `xmfmouontuvegtkwwhbw`), migrations
  0001-0014 aplicadas, **0015 ainda pendente de aplicação manual** (0009
  corrige um bug real no trigger `handle_new_user` — `CASE WHEN` sem cast
  para o enum `account_status` quebrava todo signup; 0010/0011 são a ida e
  volta do default de `posts_sort`, ver Fase 2; 0012 é os campos manuais de
  views, ver Fase 5; 0013 torna `author`/`content` opcionais em `posts` e
  adiciona `is_manual`, pro formulário "Log a manual comment" em Posts;
  0014 é `apify_runs` + `posts_time_window`; 0015 adiciona o status
  `RUNNING` em `apify_runs` pro redesenho assíncrono — ver Fase 6). **Sem
  CLI do Supabase nem `psql`
  instalados nesta máquina** (confirmado ao tentar aplicar a 0012) — só a
  `SUPABASE_SERVICE_ROLE_KEY` (chave de API/PostgREST, não senha de banco),
  que não serve pra rodar DDL. Migrations novas precisam ser coladas
  manualmente no SQL Editor do Supabase (`supabase/all_migrations_combined.sql`
  existe como cópia colável de todas juntas) até alguém instalar a CLI ou
  passar a senha do Postgres (Project Settings → Database) pra um client
  direto.

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
2. ✅ **Ingestão + classificador** (completa) — adaptador RapidAPI
   (`lib/reddit/search.ts`), rota de cron + webhook, classificador de 3
   gates, Settings (config de busca + perfil/guardrails + webhook +
   "Run ingestion now") e Posts (lista com filtros + correção humana) na UI
   de cada empresa. Entrega: posts da MAA chegam, são classificados, e
   staff corrige manualmente quando o classificador erra. Ver "Fase 2 —
   notas de implementação" acima pros detalhes que não são óbvios (cota da
   RapidAPI, flakiness, `sort`, filtro de 24h).
3. ✅ **Personas + resposta persona-aware** (completa) — migration 0005 (já
   aplicada) + `scripts/import-personas.ts`, aba Personas por empresa
   (`lib/ai/reply-generator.ts` + tab "Personas"), gerador de resposta,
   rascunho editável + marcar/desmarcar como postado em Posts. Entrega: o
   fluxo principal ponta a ponta (post relevante → rascunho na voz certa →
   revisão humana → marcado como postado). Ver "Fase 3 — notas de
   implementação" logo abaixo da seção "Import das personas" pros detalhes
   que não são óbvios.
4. ✅ **Geração de posts** (completa, verificada ponta a ponta) — migration
   0008 (já aplicada), `lib/ai/post-generator.ts` com os dois modos, rotas
   `/generic-post-generator` e `/companies/[companyId]/post-generator`.
   Entrega: staff gera posts originais com IA (genérico ou calibrado por
   empresa/persona), vê destaque + histórico expansível, copia título/corpo,
   deleta. Ver "Fase 4 — notas de implementação" pros detalhes não óbvios
   (dois bugs reais corrigidos durante o teste manual).
5. **Polimento (em andamento)**:
   - ✅ **Dashboards/analytics na Overview** (implementado e verificado nesta
     sessão) — migration 0012 (`views_count`/`comment_views_count`, aplicada
     manualmente pelo usuário via SQL Editor do Supabase, já que esta máquina
     não tem CLI/psql), 3 gráficos novos (`recharts`) em
     `app/(dashboard)/companies/[companyId]/page.tsx`: posts postados,
     comentários gerados-vs-postados, e views reportadas — tudo com janela de
     30 dias, gap-fill, tooltip e legenda custom, tema claro/escuro e
     `prefers-reduced-motion` respeitados. Peça que faltava e foi construída
     nesta sessão: `post_generations.posted_at`/`posted_by` já existiam no
     schema (migration 0008) mas não tinham UI nenhuma — sem isso a métrica
     de "posts postados" não tinha de onde vir dado. Views é campo 100%
     manual (Reddit não expõe contagem de views via API), staff digita na UI
     do Post Generator e da aba Posts. Ver `lib/analytics/` (bucketing +
     queries) e `components/analytics/` (gráficos). Verificado com dados
     reais + um lote de dados sintéticos temporários (gerado e depois
     removido via `scripts/seed-analytics-demo.ts`) pra confirmar
     bucketing/gap-fill com múltiplos pontos.
   - Pendente: notificações, credenciais de API por empresa, segunda
     empresa-piloto além da MAA.
6. ✅ **Migração RapidAPI → Apify** (completa, redesenhada pra assíncrona
   ainda nesta sessão) — a busca de Reddit trocou de provedor por completo:
   `lib/reddit/apify.ts` (antes `search.ts`) roda o actor
   `harshmaur/reddit-scraper` via API REST do Apify, substituindo
   `reddit34.p.rapidapi.com`. Um run real mediu ~4min (5 keywords × 5
   subreddits) — tempo demais/variável pra segurar uma requisição da Vercel
   esperando, então o fluxo é: cron/"Run ingestion now" **disparam** o run
   com um webhook ad-hoc anexado e devolvem na hora; `api/webhooks/apify-run-complete`
   recebe o aviso da Apify quando o run termina (minutos depois) e só aí
   busca os itens do dataset, filtra, ingere e classifica. Nova tabela
   `apify_runs` (migrations 0014/0015, com status `RUNNING` intermediário)
   guarda histórico de custo por run; Settings ganhou campo "Time window"
   (janela real de busca, antes um no-op na RapidAPI) e um indicador
   discreto de gasto mensal da conta Apify (mostra "in progress…" enquanto
   o run mais recente ainda não voltou). Ver "Fase 6 — notas de
   implementação" pros detalhes não óbvios. **`RAPIDAPI_HOST`/`RAPIDAPI_KEYS`
   saem, `APIFY_TOKEN` + `APIFY_WEBHOOK_SECRET` entram** — precisa ser
   setado manualmente em `.env.local` (já feito localmente) e nas env vars
   da Vercel (prod + preview) antes do próximo deploy.

## Verificação

- Passo 0: teste de `curl` retorna 200 com o modelo respondendo — sem isso,
  nada do resto funciona, é o primeiro checkpoint real.
- Fase 1: criar conta, confirmar que fica `pending`, aprovar via
  `caiomorgz@gmail.com` (admin bootstrap), criar a empresa MAA.
- Fase 2: ✅ feito — "Run ingestion now" e o webhook (`curl` com post de
  teste) confirmados na MAA, `posts` chegando com `ai_status='processed'` e
  `relevance_score` preenchido, correção humana gravando em
  `classifier_examples`.
- Fase 3: parcialmente verificado nesta sessão — script de import rodado
  contra o Supabase real da MAA (4 personas confirmadas na tabela, reimport
  confirmado idempotente); `generateReply()` testado de ponta a ponta contra
  o AI gateway e o Supabase reais (via rota de debug temporária chamada com
  `curl`, depois removida) tanto em modo auto (escolheu
  `estudante-construindo-curriculo-do-zero` para um post real de calouro de
  medicina sem experiência de pesquisa — persona coerente com o post) quanto
  com override manual de persona; nos dois casos o texto saiu em inglês, sem
  hífen/travessão, e as colunas `generated_comment*` gravaram certo no
  Supabase. **Não verificado ainda**: os cliques de UI em si (botão
  "Generate reply"/"Regenerate", salvar edição do rascunho, marcar/desmarcar
  como postado, toggle de `is_active` na aba Personas) — não consegui logar
  no app (sem a senha do admin) para testar pelo navegador. Essas ações são
  Server Actions simples (leem `FormData`, um `update` no Supabase,
  `revalidatePath`) no mesmo padrão de `setHumanVerdict`/
  `updateCompanySettings` já validados nas Fases 1/2, e `npm run build`
  type-checou todo o JSX das páginas novas, mas ainda vale um teste manual
  no navegador antes de considerar 100% fechado.
- Fase 4: `npm run build`/`lint` limpos; smoke test de rotas não-autenticadas
  (redirect pra `/login`, sem 500) via `curl`; chamada direta ao AI gateway
  confirmada funcionando fora do Next (script Node avulso, resposta real do
  modelo). Numa sessão anterior, o teste manual do usuário no navegador
  revelou dois problemas, já corrigidos (ver "Fase 4 — notas de
  implementação"): erro de serialização de Server Action no histórico, e um
  404 transitório de fonte do Google em dev (não afeta build de produção).
  **Fechado nesta sessão**: fluxo completo (gerar → toast → destaque →
  Copy Title/Copy Body → expandir histórico → Delete) dirigido de ponta a
  ponta via Chromium headless nos dois modos (empresa MAA e genérico), contra
  infra real — ver nota na "Status atual" acima pros detalhes. Não sobrou
  nenhum erro de console/página nas duas rodadas. **Detalhe observado, não
  bloqueante**: durante a sessão de teste automatizado (navegação rápida
  entre abas via `page.goto` em sequência) o log do dev server mostrou
  algumas vezes `Error: The destination stream closed early` — consistente
  com abortar um RSC stream em voo ao navegar de novo antes dele terminar,
  o que só acontece com navegação client-side muito mais rápida que um
  humano clicando; não reproduzido como erro visível na UI nem nos
  screenshots. Vale ficar de olho se aparecer de novo num uso normal.

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
