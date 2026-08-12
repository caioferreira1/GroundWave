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
