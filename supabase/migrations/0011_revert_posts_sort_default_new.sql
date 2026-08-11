-- Reverts 0010. Real-run feedback on the Meta Analysis Academy company
-- ("bons posts, mas todos antigos") confirmed live: sort=relevance ignores
-- recency entirely and surfaces years-old posts, while sort=new returns
-- fresh posts that the 3-gate AI classifier already filters for topical
-- relevance correctly. New companies default back to 'new'; existing rows
-- are untouched (changeable per-company in Settings).

alter table public.companies alter column posts_sort set default 'new';
