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
