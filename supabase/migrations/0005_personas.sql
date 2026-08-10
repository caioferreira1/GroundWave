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
