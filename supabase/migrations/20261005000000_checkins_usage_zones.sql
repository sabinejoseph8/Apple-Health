-- Phase 3: the daily check-in (R16 to R19), the usage log (R43: card views
-- and Why today opens) and the zone numbers for Why today (R40, D62).
-- Only adds tables and functions, so the live app keeps working.

-- Check-ins: every answer is kept, so the first answer, its time and whether
-- the status had already been seen stay on record for the Signal check (R18).
create table public.checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  answer text not null check (answer in ('good', 'okay', 'off')),
  answered_at timestamptz not null default now(),
  status_seen_before boolean not null,
  is_first boolean not null
);

create index checkins_user_date on public.checkins (user_id, date, answered_at desc);

alter table public.checkins enable row level security;

create policy "checkins: read own"
  on public.checkins for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.checkins from anon, authenticated;
grant select on public.checkins to authenticated;

-- The usage log: what was opened and when, never health values (tech-spec
-- section 6). The meta holds at most the day, whether a status was showing
-- and which kind of card it was.
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in ('card_view', 'why_today_open', 'checkin_skipped')),
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index usage_events_user_at on public.usage_events (user_id, at desc);

alter table public.usage_events enable row level security;

create policy "usage events: read own"
  on public.usage_events for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;

-- Saves a check-in answer for the phone's local date. Answering again keeps
-- the earlier answers (R18). p_status_seen is true when the card was already
-- showing a status (after Skip); a logged card view showing a status for that
-- day counts too.
create function public.submit_checkin(p_date date, p_answer text, p_status_seen boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamp := now() at time zone 'utc';
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_answer is null or p_answer not in ('good', 'okay', 'off') then
    raise exception 'unknown answer' using errcode = '22023';
  end if;
  -- Today somewhere on Earth: from 12 hours behind UTC to 14 hours ahead.
  if p_date is null or p_date < (v_now - interval '12 hours')::date or p_date > (v_now + interval '14 hours')::date then
    raise exception 'a check-in is for today only' using errcode = '22023';
  end if;

  -- One answer at a time per person, so only one can be the first.
  perform pg_advisory_xact_lock(hashtext('checkin:' || v_user::text));
  if (select count(*) from public.checkins where user_id = v_user and date = p_date) >= 50 then
    raise exception 'too many answers today' using errcode = '54000';
  end if;

  insert into public.checkins (user_id, date, answer, status_seen_before, is_first)
  values (v_user, p_date, p_answer,
          coalesce(p_status_seen, false) or exists (
            select 1 from public.usage_events e
             where e.user_id = v_user and e.event = 'card_view'
               and e.meta ->> 'date' = p_date::text and e.meta ->> 'status_shown' = 'true'),
          not exists (select 1 from public.checkins c where c.user_id = v_user and c.date = p_date));
end;
$$;

-- Logs one usage event for the signed-in user. Refuses anything outside the
-- fixed shape, so no health value can be written here. Past 500 events in a
-- day it quietly stops logging rather than breaking the app.
create function public.log_usage(p_event text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('card_view', 'why_today_open', 'checkin_skipped') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  if jsonb_typeof(v_meta) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_meta) k where k not in ('date', 'status_shown', 'state'))
     or (v_meta ? 'date' and coalesce(v_meta ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$')
     or (v_meta ? 'status_shown' and jsonb_typeof(v_meta -> 'status_shown') <> 'boolean')
     or (v_meta ? 'state' and coalesce(v_meta ->> 'state', '') not in
           ('status', 'waiting', 'analysing', 'night_unfinished', 'missed', 'no_sync', 'not_enough_data', 'learning'))
  then
    raise exception 'unexpected details' using errcode = '22023';
  end if;
  if v_meta ? 'date' then
    perform (v_meta ->> 'date')::date;
  end if;

  if (select count(*) from public.usage_events where user_id = v_user and at > now() - interval '1 day') >= 500 then
    return;
  end if;
  insert into public.usage_events (user_id, event, meta) values (v_user, p_event, v_meta);
end;
$$;

-- The zone numbers and normal window of a settings version (the active one
-- when none is given), for Why today (R40, D62). Gives the order of the
-- readings by weight, never the weights themselves.
create function public.status_zones(p_version integer default null)
returns table (
  version integer,
  ease_off_at numeric,
  rest_at numeric,
  window_nights integer,
  min_valid_nights integer,
  reading_order text[],
  readings jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.version, s.ease_off_at, s.rest_at, s.window_nights, s.min_valid_nights,
         (select array_agg(w.key order by w.value::numeric desc, w.key) from jsonb_each_text(s.weights) as w),
         (select jsonb_object_agg(m, jsonb_build_object(
                   'window_nights', coalesce((s.per_metric_overrides -> m ->> 'window_nights')::integer, s.window_nights),
                   'min_valid_nights', coalesce((s.per_metric_overrides -> m ->> 'min_valid_nights')::integer, s.min_valid_nights)))
            from unnest(array['hrv', 'sleep', 'sleeping_hr']) as m)
    from public.score_settings s
   where (p_version is null and s.active) or s.version = p_version
$$;

revoke all on function public.submit_checkin(date, text, boolean) from public, anon;
revoke all on function public.log_usage(text, jsonb) from public, anon;
revoke all on function public.status_zones(integer) from public, anon;
grant execute on function public.submit_checkin(date, text, boolean) to authenticated;
grant execute on function public.log_usage(text, jsonb) to authenticated;
grant execute on function public.status_zones(integer) to authenticated;
