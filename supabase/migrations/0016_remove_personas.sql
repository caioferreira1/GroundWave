-- Removing the audience-personas feature: a single generic AI prompt now
-- handles all replies/posts, no per-company persona catalog or selection.
-- Personas are going away in favor of one better-structured agent later;
-- this just tears the old branching out.

alter table public.posts
  drop column generated_comment_persona_id,
  drop column generated_comment_persona_rationale;

alter table public.post_generations
  drop constraint post_generations_mode_matches_company;
alter table public.post_generations
  add constraint post_generations_mode_matches_company check (
    (mode = 'generic' and company_id is null)
    or (mode = 'company' and company_id is not null)
  );
alter table public.post_generations
  drop column persona_id,
  drop column persona_rationale;

drop table public.personas;
