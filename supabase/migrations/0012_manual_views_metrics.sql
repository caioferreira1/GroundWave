-- Manually-entered "reported views" counters. Reddit's API doesn't expose
-- view counts, so these are staff-entered numbers surfaced on the company
-- Overview analytics charts — an explicitly partial/manual metric, not
-- automatically collected. `comment_views_count` (not a generic
-- `views_count` on posts) to avoid confusion with `posts.upvotes`, which is
-- the *original* Reddit post's upvote count captured at ingestion time —
-- unrelated to views on our own posted reply.
--
-- No RLS changes: both columns live on existing tables whose "staff full
-- access" (ALL) policies already cover UPDATE, and existing client SELECT
-- policies already expose them for read — RLS is row-level, not column-level.

alter table public.post_generations
  add column views_count integer,
  add constraint post_generations_views_count_check
    check (views_count is null or views_count >= 0);

alter table public.posts
  add column comment_views_count integer,
  add constraint posts_comment_views_count_check
    check (comment_views_count is null or comment_views_count >= 0);
