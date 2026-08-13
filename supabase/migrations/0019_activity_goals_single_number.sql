-- Weekly comment goals were a min/max range per metric; collapse each into a
-- single number (matching activity_company_post_per_week's convention).
-- Existing "max" value survives as the new single target — it was already
-- the number actually driving Today's tasks (see lib/activity/rotation.ts),
-- the min only fed the weekly-progress meter's floor.

alter table public.companies
  add column activity_generic_comments_per_week integer,
  add column activity_target_comments_per_week integer;

update public.companies
set activity_generic_comments_per_week = activity_generic_comments_max,
    activity_target_comments_per_week = activity_target_comments_max;

alter table public.companies
  alter column activity_generic_comments_per_week set not null,
  alter column activity_generic_comments_per_week set default 12,
  alter column activity_target_comments_per_week set not null,
  alter column activity_target_comments_per_week set default 3;

alter table public.companies
  drop column activity_generic_comments_min,
  drop column activity_generic_comments_max,
  drop column activity_target_comments_min,
  drop column activity_target_comments_max;
