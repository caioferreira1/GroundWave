-- Splits the single "target" tag (which conflated "mentions the company"
-- and "contributes to the conversation without mentioning it") into two
-- distinct values, on both comment_type (posts) and post_type
-- (post_generations): 'contribuites' (no company mention) and 'target'
-- (mentions/promotes the company). post_type's old 'company_mention' value
-- is renamed to 'target' so both columns share the same 3-value vocabulary.

-- Constraints must come off before the rename below, or the old
-- ('generic', 'company_mention')-only check rejects the 'target' rows it's
-- about to allow.
alter table public.posts drop constraint if exists posts_comment_type_check;
alter table public.post_generations drop constraint if exists post_generations_post_type_check;

update public.post_generations set post_type = 'target' where post_type = 'company_mention';

alter table public.posts add constraint posts_comment_type_check
  check (comment_type in ('generic', 'contribuites', 'target'));

alter table public.post_generations add constraint post_generations_post_type_check
  check (post_type in ('generic', 'contribuites', 'target'));
