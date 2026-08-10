-- Live testing against the RapidAPI reddit34 search (see Fase 2 plan)
-- showed sort=new barely honors the boolean keyword/subreddit query (mostly
-- unrelated recent posts), while sort=relevance reliably returns on-topic
-- matches — the 3-gate AI classifier is what filters the stale/news-share
-- posts relevance sort tends to surface. New companies now default to it;
-- existing rows are untouched (changeable per-company in Settings).

alter table public.companies alter column posts_sort set default 'relevance';
