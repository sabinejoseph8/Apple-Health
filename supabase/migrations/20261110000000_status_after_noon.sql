-- D119 (10 November 2026, Sabine): when last night arrives after noon, the card
-- still shows today's status, marked late, but with no nudge and no 8pm
-- question (R29 changed). The card records what it showed (D61), so a status
-- shown after noon is recorded with no nudge: nothing then treats the day as a
-- change day (shown_change_nudge, the 8pm question, follow-through answers).
-- Backward compatible: rows shown before this change keep their nudge.

alter table public.shown_status alter column nudge drop not null;

-- The sync the card goes by, as the morning notification uses it: the one that
-- completed the night, or else the latest that day. True when it came at or
-- after local noon.
create function public.synced_after_noon(p_user uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(min(u.received_at) filter (where u.night_complete), max(u.received_at))
       from public.uploads u
      where u.user_id = p_user and u.status = 'accepted' and u.kind = 'daily' and u.local_date = p_date)
      >= public.local_moment(p_user, p_date, '12:00'),
    false)
$$;

revoke all on function public.synced_after_noon(uuid, date) from public, anon, authenticated;

-- The card first showing a status saves what was shown (D61); after noon, with
-- no nudge (D119). Same signature and privileges as before.
create or replace function public.record_shown(p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.shown_status (user_id, date, via, status, nudge, reason_codes, readings_used, total, settings_version)
  select d.user_id, d.date, 'card', d.status,
         case when public.synced_after_noon(v_user, d.date) then null else d.nudge end,
         d.reason_codes, d.readings_used, d.total, d.settings_version
    from public.daily_status d
   where d.user_id = v_user and d.date = p_date and d.status <> 'none'
  on conflict (user_id, date, via) do nothing;
end;
$$;
