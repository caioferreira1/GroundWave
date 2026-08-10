-- Bug fix: the CASE expression in handle_new_user() (migration 0002) resolved
-- to `text`, which has no implicit assignment cast to the `account_status`
-- enum column — every signup failed with "Database error creating new user".
-- Explicit casts on each branch fix it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, display_name)
  values (
    new.id,
    new.email,
    case when new.email = 'caiomorgz@gmail.com'
      then 'approved'::public.account_status
      else 'pending'::public.account_status
    end,
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
