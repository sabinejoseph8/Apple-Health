-- Phase 1a: accounts and push subscriptions (docs/tech-spec.md, section 3).
--
-- Every table has row-level security. Signed-in users can read only their own
-- rows. Nobody writes to these tables directly: rows are written by a trigger
-- or by named database functions that work out the user from the session.

-- Profiles: one row per account, created automatically when the owner
-- creates the account in the dashboard.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_owner boolean not null default false,
  latest_tz_offset_min integer,
  watch_model text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;

-- Keeps profiles in step with accounts. The owner flag lives in the login
-- system's admin-only metadata (app_metadata.is_owner), which users can't
-- change, and is copied here so the app can read it.
create function public.sync_profile_from_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, is_owner)
  values (new.id, coalesce((new.raw_app_meta_data ->> 'is_owner')::boolean, false))
  on conflict (user_id) do update
    set is_owner = excluded.is_owner;
  return new;
end;
$$;

revoke all on function public.sync_profile_from_account() from public, anon, authenticated;

create trigger sync_profile_on_account_change
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_from_account();

-- Push subscriptions: one row per device that has allowed notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: read own"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;

-- Saves this device's subscription for the signed-in user. The user always
-- comes from the session, never from the arguments. A device belongs to
-- whoever signed in on it last, so signing in as another account on the same
-- phone moves the device to that account and the previous account stops
-- getting notifications there.
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2048 then
    raise exception 'invalid push endpoint' using errcode = '22023';
  end if;
  if coalesce(length(p_p256dh), 0) not between 1 and 256
     or coalesce(length(p_auth), 0) not between 1 and 256 then
    raise exception 'invalid push keys' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_seen_at = now(),
        revoked_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_push(text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;
