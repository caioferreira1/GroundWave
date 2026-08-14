-- ===== 0001_extensions_and_helpers.sql =====
-- Extensions + generic helpers reused by every table with an updated_at column.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===== 0002_profiles_and_roles.sql =====
-- Staff/auth foundation: profiles (1:1 with auth.users), roles, and the
-- is_staff()/is_approved()/has_role() helpers every later RLS policy uses.
-- Deliberately created before `companies` (see 0003) so these functions never
-- have a forward reference to a table that doesn't exist yet.

create type public.account_status as enum ('pending', 'approved', 'denied');
create type public.app_role as enum ('admin', 'coworker', 'client');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  job_title text,
  avatar_path text,
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.is_approved(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = _user_id and status = 'approved'
  );
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_approved(_user_id)
    and (public.has_role(_user_id, 'admin') or public.has_role(_user_id, 'coworker'));
$$;

-- Bootstrap admin: the first account to sign up with this email is
-- auto-approved with the admin role, so there's always a way in without a
-- manual SQL step after deploy. Everyone else starts 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, display_name)
  values (
    new.id,
    new.email,
    case when new.email = 'caiomorgz@gmail.com' then 'approved' else 'pending' end,
    case when new.email = 'caiomorgz@gmail.com' then 'Admin' else null end
  )
  on conflict (id) do nothing;

  if new.email = 'caiomorgz@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "users read own profile"
  on public.profiles for select to authenticated using (id = auth.uid());
create policy "staff read all profiles"
  on public.profiles for select to authenticated using (public.is_staff(auth.uid()));
-- Users can edit their own display fields, but NOT their own `status` — the
-- with-check re-derives it from the row already on disk, so a self-UPDATE
-- that tries to flip pending -> approved is rejected (only the "admin manage
-- profiles" policy below, gated on the admin role, can change status).
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );
create policy "admin manage profiles"
  on public.profiles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "users read own roles"
  on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admin manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

revoke execute on function
  public.is_approved(uuid), public.has_role(uuid, public.app_role), public.is_staff(uuid)
  from public, anon;
grant execute on function
  public.is_approved(uuid), public.has_role(uuid, public.app_role), public.is_staff(uuid)
  to authenticated;

-- ===== 0003_companies.sql =====
-- Multi-tenant root. `guardrails_md` and `inbound_webhook_token` are
-- deliberate deviations from the reference app (see plan): guardrails is a
-- dedicated field so brand-safety rules never get diluted when `profile` is
-- regenerated by AI, and the webhook token is per-company instead of one
-- secret shared by every tenant.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text,
  profile text,
  guardrails_md text,
  favicon_url text,

  suggested_subreddits text[] not null default '{}',
  search_keywords text[] not null default '{}',

  posts_min_upvotes integer not null default 2,
  posts_fetch_frequency_hours integer not null default 24,
  posts_fetch_hour_utc smallint not null default 12
    check (posts_fetch_hour_utc between 0 and 23),
  posts_sort text not null default 'new'
    check (posts_sort in ('new', 'top', 'hot', 'relevance')),
  posts_max_per_run integer not null default 100
    check (posts_max_per_run between 10 and 200),
  posts_fetch_enabled boolean not null default false,
  posts_last_fetched_at timestamptz,
  posts_last_scheduled_run_at timestamptz,
  posts_last_error text,
  posts_last_error_at timestamptz,
  posts_retry_pending boolean not null default false,

  inbound_webhook_token uuid not null default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;

create policy "staff full access companies"
  on public.companies for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ===== 0004_client_companies.sql =====
-- Read-only access grant for external `client`-role users, scoped to
-- specific companies. Every later company-scoped table's client-read policy
-- goes through can_access_company() so there's a single place that defines
-- "staff sees everything, clients see only their linked companies."

create table public.client_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create or replace function public.can_access_company(_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_staff(auth.uid())
    or exists (
      select 1 from public.client_companies
      where user_id = auth.uid() and company_id = _company_id
    );
$$;

revoke execute on function public.can_access_company(uuid) from public, anon;
grant execute on function public.can_access_company(uuid) to authenticated;

alter table public.client_companies enable row level security;

create policy "users read own client_companies"
  on public.client_companies for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "admin manage client_companies"
  on public.client_companies for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Now that can_access_company() exists, add the client read-only policy on
-- companies (staff already has full access via the policy in 0003).
create policy "clients read own companies"
  on public.companies for select to authenticated
  using (public.can_access_company(id));

-- ===== 0005_personas.sql =====
-- Audience personas, scoped per company. The full synthesized markdown body
-- (Resumo through Guardrails) is stored as one blob in content_md rather than
-- broken into columns — no agent needs to query by an individual section, the
-- whole thing gets injected into generation prompts as-is.

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  slug text not null,
  display_name text not null,
  content_md text not null,
  based_on_fichas text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create trigger personas_set_updated_at
  before update on public.personas
  for each row execute function public.set_updated_at();

alter table public.personas enable row level security;

create policy "staff full access personas"
  on public.personas for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
create policy "clients read personas"
  on public.personas for select to authenticated
  using (public.can_access_company(company_id));

-- ===== 0006_posts.sql =====
-- Ingested Reddit posts, one row per post, scoped by company. ai_status
-- tracks the relevance-classifier pipeline; the generated_comment_* and
-- comment_posted_* columns track the reply-drafting/human-approval flow.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,

  author text not null,
  url text not null,
  content text not null,
  posted_at timestamptz,
  upvotes integer,
  subreddit text,
  received_at timestamptz not null default now(),

  ai_status text not null default 'pending'
    check (ai_status in ('pending', 'processed', 'failed')),
  is_relevant boolean,
  relevance_score integer,
  ai_reasoning text,
  ai_error text,

  human_verdict text check (human_verdict in ('relevant', 'irrelevant')),
  human_verdict_by uuid references public.profiles (id) on delete set null,
  human_verdict_at timestamptz,

  generated_comment text,
  generated_comment_persona_id uuid references public.personas (id) on delete set null,
  generated_comment_persona_rationale text,
  comment_generated_at timestamptz,
  comment_posted_at timestamptz,
  comment_posted_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_company_id_idx on public.posts (company_id);
create index posts_posted_at_idx on public.posts (posted_at desc nulls last);
create index posts_ai_status_idx on public.posts (ai_status);
create index posts_is_relevant_idx on public.posts (is_relevant);
create index posts_human_verdict_idx on public.posts (company_id, human_verdict);
-- Ingestion dedupe: both entry points (cron search, webhook) check for an
-- existing row with the same (company_id, url) before inserting.
create unique index posts_company_url_idx on public.posts (company_id, url);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

alter table public.posts enable row level security;

create policy "staff full access posts"
  on public.posts for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
create policy "clients read posts"
  on public.posts for select to authenticated
  using (company_id is not null and public.can_access_company(company_id));

-- ===== 0007_classifier_examples.sql =====
-- Human corrections to the relevance classifier, fed back as few-shot
-- examples in future classification prompts (see lib/ai/classifier.ts).

create table public.classifier_examples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  content text not null,
  correct_is_relevant boolean not null,
  created_at timestamptz not null default now()
);

create index classifier_examples_company_idx
  on public.classifier_examples (company_id, created_at desc);

alter table public.classifier_examples enable row level security;

create policy "staff full access classifier_examples"
  on public.classifier_examples for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
create policy "clients read classifier_examples"
  on public.classifier_examples for select to authenticated
  using (public.can_access_company(company_id));

-- ===== 0008_post_generations.sql =====
-- Original (non-reply) generated Reddit posts. company_id is nullable: null
-- means "generic mode" (no company/persona, random subreddit — the fallback
-- behavior the user explicitly wants kept alongside the company-targeted
-- mode). Visible to the whole staff team, not scoped to whoever generated it.

create table public.post_generations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  mode text not null check (mode in ('company', 'generic')),
  persona_id uuid references public.personas (id) on delete set null,
  persona_rationale text,

  subreddit text not null,
  theme text not null,
  title text not null,
  body text not null,

  created_by uuid references public.profiles (id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),

  constraint post_generations_mode_matches_company check (
    (mode = 'generic' and company_id is null and persona_id is null)
    or (mode = 'company' and company_id is not null)
  )
);

create index post_generations_company_idx
  on public.post_generations (company_id, created_at desc);

alter table public.post_generations enable row level security;

create policy "staff full access post_generations"
  on public.post_generations for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
create policy "clients read company-mode post_generations"
  on public.post_generations for select to authenticated
  using (company_id is not null and public.can_access_company(company_id));

-- ===== 0010_default_posts_sort_relevance.sql =====
-- Live testing against the RapidAPI reddit34 search (see Fase 2 plan)
-- showed sort=new barely honors the boolean keyword/subreddit query (mostly
-- unrelated recent posts), while sort=relevance reliably returns on-topic
-- matches — the 3-gate AI classifier is what filters the stale/news-share
-- posts relevance sort tends to surface. New companies now default to it;
-- existing rows are untouched (changeable per-company in Settings).

alter table public.companies alter column posts_sort set default 'relevance';

-- ===== 0011_revert_posts_sort_default_new.sql =====
-- Reverts 0010. Real-run feedback on the Meta Analysis Academy company
-- ("bons posts, mas todos antigos") confirmed live: sort=relevance ignores
-- recency entirely and surfaces years-old posts, while sort=new returns
-- fresh posts that the 3-gate AI classifier already filters for topical
-- relevance correctly. New companies default back to 'new'; existing rows
-- are untouched (changeable per-company in Settings).

alter table public.companies alter column posts_sort set default 'new';

-- ===== 0012_manual_views_metrics.sql =====
-- Manually-entered "reported views" counters. Reddit's API doesn't expose
-- view counts, so these are staff-entered numbers surfaced on the company
-- Overview analytics charts — an explicitly partial/manual metric, not
-- automatically collected. `comment_views_count` (not a generic
-- `views_count` on posts) to avoid confusion with `posts.upvotes`, which is
-- the *original* Reddit post's upvote count captured at ingestion time —
-- unrelated to views on our own posted reply.
--
-- No RLS changes: both columns live on existing tables whose "staff full
-- access" (ALL) policies already cover UPDATE, and existing client SELECT
-- policies already expose them for read — RLS is row-level, not column-level.

alter table public.post_generations
  add column views_count integer,
  add constraint post_generations_views_count_check
    check (views_count is null or views_count >= 0);

alter table public.posts
  add column comment_views_count integer,
  add constraint posts_comment_views_count_check
    check (comment_views_count is null or comment_views_count >= 0);

-- ===== 0013_manual_comments.sql =====
-- Manual comment logging: staff sometimes reply to a Reddit post found
-- organically (not surfaced by keyword search/ingestion), so there's no
-- `posts` row to attach the reply to. This lets staff log the link + the
-- comment text + who posted it directly, so it flows into the same
-- comment_posted_at/comment_views_count metrics (see 0012 and
-- lib/analytics/queries.ts) as AI-assisted replies, without the original
-- post ever needing to be ingested or classified.
--
-- `author` and `content` describe the *original* Reddit post, which a
-- manual entry never has (staff only pastes the link, not the post body) —
-- both become nullable. `is_manual` flags these rows so the UI can skip the
-- AI-only fields (status, relevance, reasoning) that never apply to them.

alter table public.posts
  alter column author drop not null,
  alter column content drop not null,
  add column is_manual boolean not null default false;

-- ===== 0014_apify_runs.sql =====
-- Histórico de runs do actor Apify (harshmaur/reddit-scraper) que substitui
-- a RapidAPI na ingestão de Reddit. Uma linha por tentativa de run (sucesso
-- ou falha) para auditoria de custo e a linha de "último run" na Settings.
-- company_id é ON DELETE SET NULL (não cascade) para não apagar histórico
-- de gasto ao deletar uma empresa.

create table public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,

  run_id text not null unique,
  dataset_id text,
  status text not null
    check (status in ('SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMEOUT_CLIENT')),
  cost_usd numeric(10, 4) not null default 0,
  compute_units numeric(10, 4) not null default 0,
  item_count integer not null default 0,
  run_time_secs numeric(10, 2) not null default 0,
  scheduled boolean not null default false,
  error text,

  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index apify_runs_company_id_idx on public.apify_runs (company_id, started_at desc);

alter table public.apify_runs enable row level security;

-- Staff-only: dado operacional/de billing, sem policy de leitura pra client
-- (diferente de `posts`).
create policy "staff full access apify_runs"
  on public.apify_runs for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Janela de tempo configurável da busca (o `t=` da URL do Reddit). Não
-- existia equivalente antes — o `time` da RapidAPI foi confirmado sem
-- efeito, então a recência só era reforçada client-side.
alter table public.companies
  add column posts_time_window text not null default 'day'
  check (posts_time_window in ('hour', 'day', 'week', 'month', 'year', 'all'));

-- "comments" é um valor válido de sort de busca do Reddit real (não fazia
-- sentido no adaptador RapidAPI); agora que a URL é montada à mão contra o
-- Reddit de verdade, vale liberar.
alter table public.companies drop constraint companies_posts_sort_check;
alter table public.companies add constraint companies_posts_sort_check
  check (posts_sort in ('new', 'top', 'hot', 'relevance', 'comments'));

-- ===== 0015_apify_runs_async.sql =====
-- Redesign of Apify ingestion to be fully async (ad-hoc webhook instead of
-- the cron/action holding a request open for the whole run — a real run was
-- measured at ~4min, too close to Vercel's function duration ceiling to
-- rely on). apify_runs rows now get inserted as 'RUNNING' at dispatch time
-- (dataset_id/cost/stats/finished_at all still unknown then — already
-- nullable/defaulted in 0014) and updated in place once the webhook reports
-- the terminal status, so the status column needs the extra value.

alter table public.apify_runs drop constraint apify_runs_status_check;
alter table public.apify_runs add constraint apify_runs_status_check
  check (status in ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMEOUT_CLIENT'));

-- ===== 0016_remove_personas.sql =====
-- Removing the audience-personas feature: a single generic AI prompt now
-- handles all replies/posts, no per-company persona catalog or selection.
-- Personas are going away in favor of one better-structured agent later;
-- this just tears the old branching out.

alter table public.posts
  drop column generated_comment_persona_id,
  drop column generated_comment_persona_rationale;

alter table public.post_generations
  drop constraint post_generations_mode_matches_company;
alter table public.post_generations
  add constraint post_generations_mode_matches_company check (
    (mode = 'generic' and company_id is null)
    or (mode = 'company' and company_id is not null)
  );
alter table public.post_generations
  drop column persona_id,
  drop column persona_rationale;

drop table public.personas;

-- ===== 0017_reddit_accounts_and_activity.sql =====
-- Reddit accounts dedicated to each company (name, karma, owning
-- collaborator), weekly activity goals per company, and tagging on
-- posts/comments so every posted item records which account posted it and
-- what kind of activity it was (generic engagement vs. mentioning/
-- contributing on the company's target audience). This is what the "Today's
-- tasks" dashboard panel and per-account rotation are computed from — there
-- is no separate assignment/task table, everything is derived live from
-- these tagged rows versus the goal columns below.

create table public.reddit_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,

  account_name text not null,
  karma integer not null default 0,
  owner_user_id uuid not null references public.profiles (id),
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reddit_accounts_company_id_idx on public.reddit_accounts (company_id);

create trigger reddit_accounts_set_updated_at
  before update on public.reddit_accounts
  for each row execute function public.set_updated_at();

alter table public.reddit_accounts enable row level security;

-- Staff-only, same reasoning as apify_runs (0014): operational data about
-- who's posting from which account, not something a client should see.
create policy "staff full access reddit_accounts"
  on public.reddit_accounts for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Accounts are soft-deleted (is_active = false) from the Accounts tab, never
-- hard-deleted through the app — on delete set null is just a safety net so
-- a manual DB-level delete never breaks historical posts/post_generations.
alter table public.posts
  add column reddit_account_id uuid references public.reddit_accounts (id) on delete set null,
  add column comment_type text check (comment_type in ('generic', 'target'));

alter table public.post_generations
  add column reddit_account_id uuid references public.reddit_accounts (id) on delete set null,
  add column post_type text check (post_type in ('generic', 'company_mention'));

-- Weekly activity goals, one set of columns per company (same convention as
-- the existing posts_* config columns on this table). Defaults match the
-- numbers given for Meta Analysis Academy; each company can tune them from
-- the new Accounts tab.
alter table public.companies
  add column activity_generic_comments_min integer not null default 8,
  add column activity_generic_comments_max integer not null default 12,
  add column activity_target_comments_min integer not null default 2,
  add column activity_target_comments_max integer not null default 3,
  add column activity_generic_post_interval_days integer not null default 2,
  add column activity_company_post_per_week integer not null default 1;

-- ===== 0018_daily_task_completions.sql =====
-- Manual "check off" state for Today's tasks chips (lib/activity/rotation.ts
-- + components/activity/todays-tasks.tsx). Checking a task records how much
-- of that day's chip was done (`count` — 1 for the boolean post tasks, the
-- shown quantity for the comment tasks) and IS folded back into the
-- rotation math: lib/activity/rotation.ts's mergeActivity() adds these
-- counts on top of real tagged activity (reddit_account_id +
-- comment_type/post_type on posts/post_generations) before computing
-- remaining quotas, so a checked-off task reduces what's asked for
-- tomorrow and moves the weekly progress meters, exactly like real logged
-- activity would. It's still a separate, self-reported source though — see
-- that comment for the double-counting caveat if the same work later also
-- gets logged for real. One row per (account, task type, day) that's been
-- checked off; unchecking deletes the row rather than storing completed =
-- false.

create table public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reddit_account_id uuid not null references public.reddit_accounts (id) on delete cascade,
  task_key text not null check (task_key in ('generic_post', 'company_mention_post', 'generic_comments', 'target_comments')),
  task_date date not null,
  count integer not null default 1 check (count > 0),
  completed_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),

  unique (reddit_account_id, task_key, task_date)
);

create index daily_task_completions_company_date_idx on public.daily_task_completions (company_id, task_date);

alter table public.daily_task_completions enable row level security;

-- Staff-only, same reasoning as reddit_accounts (0017).
create policy "staff full access daily_task_completions"
  on public.daily_task_completions for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ===== 0019_activity_goals_single_number.sql =====
-- Weekly comment goals were a min/max range per metric; collapse each into a
-- single number (matching activity_company_post_per_week's convention).
-- Existing "max" value survives as the new single target — it was already
-- the number actually driving Today's tasks (see lib/activity/rotation.ts),
-- the min only fed the weekly-progress meter's floor.

alter table public.companies
  add column activity_generic_comments_per_week integer,
  add column activity_target_comments_per_week integer;

update public.companies
set activity_generic_comments_per_week = activity_generic_comments_max,
    activity_target_comments_per_week = activity_target_comments_max;

alter table public.companies
  alter column activity_generic_comments_per_week set not null,
  alter column activity_generic_comments_per_week set default 12,
  alter column activity_target_comments_per_week set not null,
  alter column activity_target_comments_per_week set default 3;

alter table public.companies
  drop column activity_generic_comments_min,
  drop column activity_generic_comments_max,
  drop column activity_target_comments_min,
  drop column activity_target_comments_max;

-- ===== 0020_activity_generic_posts_before_target.sql =====
-- Rotation gate: each account must make this many generic posts since its
-- last company-mention (target) post before it's eligible for the next one
-- (see lib/activity/rotation.ts's computeCompanyMentionRotationStatus).
-- 0 = no gate, i.e. today's pre-rotation-gate behavior (any active account
-- is immediately eligible).
alter table public.companies
  add column activity_generic_posts_before_target integer not null default 7;
