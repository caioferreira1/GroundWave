-- Redesign of Apify ingestion to be fully async (ad-hoc webhook instead of
-- the cron/action holding a request open for the whole run — a real run was
-- measured at ~4min, too close to Vercel's function duration ceiling to
-- rely on). apify_runs rows now get inserted as 'RUNNING' at dispatch time
-- (dataset_id/cost/stats/finished_at all still unknown then — already
-- nullable/defaulted in 0014) and updated in place once the webhook reports
-- the terminal status, so the status column needs the extra value.

alter table public.apify_runs drop constraint apify_runs_status_check;
alter table public.apify_runs add constraint apify_runs_status_check
  check (status in ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMEOUT_CLIENT'));
