-- Rotation gate: each account must make this many generic posts since its
-- last company-mention (target) post before it's eligible for the next one
-- (see lib/activity/rotation.ts's computeCompanyMentionRotationStatus).
-- 0 = no gate, i.e. today's pre-rotation-gate behavior (any active account
-- is immediately eligible).
alter table public.companies
  add column activity_generic_posts_before_target integer not null default 7;
