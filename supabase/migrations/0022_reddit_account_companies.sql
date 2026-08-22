-- Reddit accounts used to belong to exactly one company (reddit_accounts.
-- company_id, not null). In practice the same account is sometimes run for
-- two companies at once, which that column can't represent — this migration
-- replaces it with a many-to-many join table. daily_task_completions needs
-- no change: it already stores company_id and reddit_account_id as two
-- independent not-null columns (never derived from reddit_accounts.
-- company_id), so it never assumed a 1:1 mapping.

create table public.reddit_account_companies (
  reddit_account_id uuid not null references public.reddit_accounts (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (reddit_account_id, company_id)
);

create index reddit_account_companies_company_idx on public.reddit_account_companies (company_id);
create index reddit_account_companies_account_idx on public.reddit_account_companies (reddit_account_id);

alter table public.reddit_account_companies enable row level security;

-- Staff-only, same reasoning as reddit_accounts (0017).
create policy "staff full access reddit_account_companies"
  on public.reddit_account_companies for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Preserve every existing 1:1 link before the column that held it is dropped.
insert into public.reddit_account_companies (reddit_account_id, company_id)
select id, company_id from public.reddit_accounts;

drop index if exists public.reddit_accounts_company_id_idx;
alter table public.reddit_accounts drop column company_id;
