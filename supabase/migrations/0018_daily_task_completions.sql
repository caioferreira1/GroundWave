-- Manual "check off" state for Today's tasks chips (lib/activity/rotation.ts
-- + components/activity/todays-tasks.tsx). Checking a task records how much
-- of that day's chip was done (`count` — 1 for the boolean post tasks, the
-- shown quantity for the comment tasks) and IS folded back into the
-- rotation math: lib/activity/rotation.ts's mergeActivity() adds these
-- counts on top of real tagged activity (reddit_account_id +
-- comment_type/post_type on posts/post_generations) before computing
-- remaining quotas, so a checked-off task reduces what's asked for
-- tomorrow and moves the weekly progress meters, exactly like real logged
-- activity would. It's still a separate, self-reported source though — see
-- that comment for the double-counting caveat if the same work later also
-- gets logged for real. One row per (account, task type, day) that's been
-- checked off; unchecking deletes the row rather than storing completed =
-- false.

create table public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reddit_account_id uuid not null references public.reddit_accounts (id) on delete cascade,
  task_key text not null check (task_key in ('generic_post', 'company_mention_post', 'generic_comments', 'target_comments')),
  task_date date not null,
  count integer not null default 1 check (count > 0),
  completed_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),

  unique (reddit_account_id, task_key, task_date)
);

create index daily_task_completions_company_date_idx on public.daily_task_completions (company_id, task_date);

alter table public.daily_task_completions enable row level security;

-- Staff-only, same reasoning as reddit_accounts (0017).
create policy "staff full access daily_task_completions"
  on public.daily_task_completions for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
