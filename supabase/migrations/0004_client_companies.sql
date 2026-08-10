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
