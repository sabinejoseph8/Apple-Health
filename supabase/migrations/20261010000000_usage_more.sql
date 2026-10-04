-- Phase 5 code review: the usage log also records trend and digest opens
-- (tech-spec, usage_events), with the same fixed shape and no health values.
alter table public.usage_events drop constraint usage_events_event_check;
alter table public.usage_events add constraint usage_events_event_check
  check (event in ('card_view', 'why_today_open', 'checkin_skipped', 'trends_open', 'digest_open'));

create or replace function public.log_usage(p_event text, p_meta jsonb default '{}'::jsonb)
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
  if p_event is null or p_event not in ('card_view', 'why_today_open', 'checkin_skipped', 'trends_open', 'digest_open') then
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
