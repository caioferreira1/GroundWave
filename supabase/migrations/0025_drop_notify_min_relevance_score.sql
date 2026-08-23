-- Reverts 0024: the per-user configurable alert threshold was replaced with
-- a single fixed bar (MIN_RELEVANCE_SCORE_FOR_EMAIL = 85 in
-- lib/notifications/relevant-posts.ts) before it ever shipped to users, so
-- there's no data worth preserving here.

alter table public.profiles
  drop column notify_min_relevance_score;
