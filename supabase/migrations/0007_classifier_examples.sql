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
