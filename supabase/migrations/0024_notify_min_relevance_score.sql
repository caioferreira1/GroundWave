-- Per-user minimum relevance score to trigger the "new relevant posts" email
-- alert (lib/notifications/relevant-posts.ts) — a stricter bar than the
-- classifier's own is_relevant cutoff (score >= 50, see
-- lib/ai/classifier.ts's RELEVANCE_THRESHOLD), so a staff member can ask to
-- only be emailed about the strongest matches. Default 70 mirrors the
-- classifier prompt's own "70-90: clearly on-topic" band. Admin-set on
-- /admin/users, same place as notify_relevant_posts (0023).

alter table public.profiles
  add column notify_min_relevance_score smallint not null default 70
    constraint profiles_notify_min_relevance_score_range check (notify_min_relevance_score between 0 and 100);
