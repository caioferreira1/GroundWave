-- Manual comment logging: staff sometimes reply to a Reddit post found
-- organically (not surfaced by keyword search/ingestion), so there's no
-- `posts` row to attach the reply to. This lets staff log the link + the
-- comment text + who posted it directly, so it flows into the same
-- comment_posted_at/comment_views_count metrics (see 0012 and
-- lib/analytics/queries.ts) as AI-assisted replies, without the original
-- post ever needing to be ingested or classified.
--
-- `author` and `content` describe the *original* Reddit post, which a
-- manual entry never has (staff only pastes the link, not the post body) —
-- both become nullable. `is_manual` flags these rows so the UI can skip the
-- AI-only fields (status, relevance, reasoning) that never apply to them.

alter table public.posts
  alter column author drop not null,
  alter column content drop not null,
  add column is_manual boolean not null default false;
