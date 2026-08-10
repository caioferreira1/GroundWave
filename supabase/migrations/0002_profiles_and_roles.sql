-- Staff/auth foundation: profiles (1:1 with auth.users), roles, and the
-- is_staff()/is_approved()/has_role() helpers every later RLS policy uses.
-- Deliberately created before `companies` (see 0003) so these functions never
-- have a forward reference to a table that doesn't exist yet.

create type public.account_status as enum ('pending', 'approved', 'denied');
create type public.app_role as enum ('admin', 'coworker', 'client');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  job_title text,
  avatar_path text,
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.is_approved(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = _user_id and status = 'approved'
  );
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_approved(_user_id)
    and (public.has_role(_user_id, 'admin') or public.has_role(_user_id, 'coworker'));
$$;

-- Bootstrap admin: the first account to sign up with this email is
-- auto-approved with the admin role, so there's always a way in without a
-- manual SQL step after deploy. Everyone else starts 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, display_name)
  values (
    new.id,
    new.email,
    case when new.email = 'caiomorgz@gmail.com' then 'approved' else 'pending' end,
    case when new.email = 'caiomorgz@gmail.com' then 'Admin' else null end
  )
  on conflict (id) do nothing;

  if new.email = 'caiomorgz@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "users read own profile"
  on public.profiles for select to authenticated using (id = auth.uid());
create policy "staff read all profiles"
  on public.profiles for select to authenticated using (public.is_staff(auth.uid()));
-- Users can edit their own display fields, but NOT their own `status` — the
-- with-check re-derives it from the row already on disk, so a self-UPDATE
-- that tries to flip pending -> approved is rejected (only the "admin manage
-- profiles" policy below, gated on the admin role, can change status).
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );
create policy "admin manage profiles"
  on public.profiles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "users read own roles"
  on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admin manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

revoke execute on function
  public.is_approved(uuid), public.has_role(uuid, public.app_role), public.is_staff(uuid)
  from public, anon;
grant execute on function
  public.is_approved(uuid), public.has_role(uuid, public.app_role), public.is_staff(uuid)
  to authenticated;
