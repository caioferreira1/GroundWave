-- Editorial calendar for planned Reddit posts across every company, replacing
-- a manually-maintained static HTML planning doc. Tracks POSTS only (not
-- comment quotas — those stay in the existing rotation/activity system,
-- lib/activity/rotation.ts). Organized by real ISO calendar week (iso_year +
-- iso_week, see lib/schedule/iso-week.ts), not "week N of the contract", so
-- the same table works across every company's own start date. A global
-- table (like reddit_accounts since 0022) — company_id tags which company a
-- post belongs to, it does not scope the table to one company.

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies (id) on delete cascade,
  -- Soft link: an account can be deactivated/removed without losing the
  -- historical plan row, same on-delete-set-null policy as
  -- posts.reddit_account_id / post_generations.reddit_account_id (0017).
  reddit_account_id uuid references public.reddit_accounts (id) on delete set null,

  -- Free text, not an enum/CHECK — adding a new collaborator must never
  -- require a migration. Constrained only in the UI
  -- (components/schedule/constants.ts).
  collaborator text,

  post_kind text not null check (post_kind in ('target', 'generic')),

  -- Real ISO-8601 week-of-year, computed by lib/schedule/iso-week.ts at
  -- write time from the <input type="week"> value — never re-derived from
  -- planned_date, since planned_date is optional and a week can exist
  -- without a specific day picked yet.
  iso_year integer not null check (iso_year between 2000 and 2100),
  iso_week integer not null check (iso_week between 1 and 53),

  -- Optional specific day within that ISO week — not required at creation
  -- (the user picks a week, not a date), filled in later once the exact
  -- publish day is locked in.
  planned_date date,

  title text not null,
  body_copy text not null,
  -- Combines the source doc's "format" + "theme" line into one free-text note.
  format_note text,
  objective_note text,

  post_url text,
  is_posted boolean not null default false,
  posted_at timestamptz,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Main query pattern: "give me everything for this ISO week, across
-- companies" (page.tsx groups by week first, filters by company second).
create index scheduled_posts_week_idx on public.scheduled_posts (iso_year, iso_week);
create index scheduled_posts_company_idx on public.scheduled_posts (company_id);

create trigger scheduled_posts_set_updated_at
  before update on public.scheduled_posts
  for each row execute function public.set_updated_at();

alter table public.scheduled_posts enable row level security;

-- Staff-only, same reasoning as reddit_accounts (0017) / daily_task_completions
-- (0018): operational content-planning data, not something a client should see.
create policy "staff full access scheduled_posts"
  on public.scheduled_posts for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
