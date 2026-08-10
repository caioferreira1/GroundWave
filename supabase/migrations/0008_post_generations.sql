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
