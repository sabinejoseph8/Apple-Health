-- Phase 2c: events and workouts for the Signal check on the owner's year
-- (docs/tech-spec.md, section 3; product-spec R66; mvp.md D9, A2; decisions
-- D54 and D55).
--
-- Events (illness, major events, travel) come from the owner's calendar, and
-- workout summaries from a one-time Health app export (D54). Both are loaded
-- by the owner with scripts that sign in as her (scripts/owner/), so no
-- secret key is needed on her Mac, and the files they read stay in private/,
-- which is never committed. Only the owner can load them; everyone can read
-- only their own rows; nobody writes to the tables directly.

create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  type text not null check (type in ('illness', 'major_event', 'travel')),
  note text check (length(note) <= 200),
  source text not null default 'manual' check (source in ('manual', 'detected')),
  created_at timestamptz not null default now()
);

create index events_user_date_idx on public.events (user_id, date);

alter table public.events enable row level security;

create policy "events: read own"
  on public.events for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;

create table public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  activity text not null check (length(activity) <= 80),
  start_at timestamptz not null,
  end_at timestamptz not null,
  tz_offset_min integer not null check (tz_offset_min between -720 and 840),
  duration_min numeric not null check (duration_min >= 0 and duration_min <= 1440),
  avg_hr numeric check (avg_hr between 25 and 250),
  source_name text check (length(source_name) <= 120),
  created_at timestamptz not null default now(),
  check (end_at >= start_at),
  unique (user_id, activity, start_at)
);

alter table public.workouts enable row level security;

create policy "workouts: read own"
  on public.workouts for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.workouts from anon, authenticated;
grant select on public.workouts to authenticated;

-- Replaces the signed-in owner's manual events with the given list:
-- [{"date": "2026-02-03", "type": "illness", "note": "cold"}, ...].
-- Running it again with the same file gives the same table.
create function public.replace_my_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null or not exists (select 1 from public.profiles where user_id = v_user and is_owner) then
    raise exception 'only the owner can load events' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'events must be a list';
  end if;

  delete from public.events where user_id = v_user and source = 'manual';
  insert into public.events (user_id, date, type, note, source)
  select v_user, (e ->> 'date')::date, e ->> 'type', nullif(e ->> 'note', ''), 'manual'
    from jsonb_array_elements(p_events) as e;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Replaces the signed-in owner's workouts with the given list:
-- [{"activity": "running", "start_at": "...", "end_at": "...",
--   "tz_offset_min": -300, "duration_min": 42.5, "avg_hr": 151,
--   "source_name": "Apple Watch"}, ...].
create function public.replace_my_workouts(p_workouts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null or not exists (select 1 from public.profiles where user_id = v_user and is_owner) then
    raise exception 'only the owner can load workouts' using errcode = '42501';
  end if;
  if jsonb_typeof(p_workouts) is distinct from 'array' then
    raise exception 'workouts must be a list';
  end if;

  delete from public.workouts where user_id = v_user;
  insert into public.workouts (user_id, activity, start_at, end_at, tz_offset_min, duration_min, avg_hr, source_name)
  select v_user, w ->> 'activity', (w ->> 'start_at')::timestamptz, (w ->> 'end_at')::timestamptz,
         (w ->> 'tz_offset_min')::integer, (w ->> 'duration_min')::numeric, (w ->> 'avg_hr')::numeric,
         nullif(w ->> 'source_name', '')
    from jsonb_array_elements(p_workouts) as w;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_my_events(jsonb) from public, anon;
revoke all on function public.replace_my_workouts(jsonb) from public, anon;
grant execute on function public.replace_my_events(jsonb) to authenticated;
grant execute on function public.replace_my_workouts(jsonb) to authenticated;
