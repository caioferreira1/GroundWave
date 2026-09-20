-- Turns the schedule feature's free-text "format" note into a proper,
-- growable tag vocabulary: a small reference table (same shape as other
-- small lookup tables in this app) plus a nullable FK on scheduled_posts.
-- Staff can add a new tag from the Schedule UI itself (see
-- createFormatTag in app/(dashboard)/schedule/actions.ts) — no migration
-- needed to grow the list, unlike the collaborator free-text column.
--
-- scheduled_posts.format_note (0027) is left in place but unused going
-- forward — its existing values are backfilled into format_tag_id by a
-- one-off script (scripts/backfill-schedule-format-tags.ts), not by this
-- migration, so this file only needs to add structure.

create table public.schedule_format_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

alter table public.schedule_format_tags enable row level security;

create policy "staff full access schedule_format_tags"
  on public.schedule_format_tags for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

alter table public.scheduled_posts
  add column format_tag_id uuid references public.schedule_format_tags (id) on delete set null;
