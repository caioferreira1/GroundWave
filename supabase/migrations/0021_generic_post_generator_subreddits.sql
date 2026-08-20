-- Configurable subreddit pool for the generic (no company targeting) post
-- generator. Previously a hardcoded array in lib/reddit/subreddits.ts;
-- moved to a singleton settings row so staff can edit it from the UI.
-- Seeded with that same list so behavior is unchanged until someone edits it.

create table public.generic_post_generator_settings (
  id smallint primary key default 1 check (id = 1),
  subreddits text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger generic_post_generator_settings_set_updated_at
  before update on public.generic_post_generator_settings
  for each row execute function public.set_updated_at();

insert into public.generic_post_generator_settings (id, subreddits)
values (1, array[
  'asktheworld',
  'askabrazilian',
  'askagerman',
  'motorcycles',
  'biohackers',
  'travel',
  'digitalnomad',
  'NoStupidQuestions',
  'askanamerican',
  'askrussian',
  'germany',
  'cooking'
]);

alter table public.generic_post_generator_settings enable row level security;

create policy "staff full access generic_post_generator_settings"
  on public.generic_post_generator_settings for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
