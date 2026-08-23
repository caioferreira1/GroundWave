-- Per-user opt-in for the "new relevant posts" email alert (set by an admin
-- on /admin/users, not self-service) — see lib/notifications/relevant-posts.ts.
-- Defaults to false so nobody starts getting emails they didn't ask for.

alter table public.profiles
  add column notify_relevant_posts boolean not null default false;
