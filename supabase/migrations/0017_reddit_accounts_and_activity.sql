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
