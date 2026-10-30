-- 7b-1c (30 October 2026, D103 refined after an independent review of 7b-1b): two changes to the
-- 11:30 reminder rule, in the same function with the same signature and privileges.
--
--  1. A day whose reason is not_enough_data now gets the reminder. That reason also covers a finished
--     night with fewer than two readings, for example when the sleep stages reach Health before the
--     heart readings do, and a later sync can bring the rest. Only "learning" is left out, since
--     nothing a person taps can change it.
--  2. The 3-minute wait for a sync that is still being worked out no longer applies at the last
--     check before noon (11:55), so a post at 11:53 cannot silence the reminder with no later check.
create or replace function public.plan_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_local timestamp;
  v_count integer := 0;
begin
  for v_person in
    select p.user_id
      from public.profiles p
     where p.latest_tz_offset_min is not null
       -- Only people who sync: an accepted post in the last two weeks.
       and exists (select 1 from public.uploads u
                    where u.user_id = p.user_id and u.status = 'accepted' and u.received_at > p_now - interval '14 days')
  loop
    v_local := public.local_now(v_person.user_id, p_now);

    if v_local::time >= '11:30' and v_local::time < '12:00'
       and not exists (select 1 from public.daily_status d
                        where d.user_id = v_person.user_id and d.date = v_local::date
                          and (d.status <> 'none' or d.no_status_reason = 'learning'))
       and (v_local::time >= '11:55'
            or not exists (select 1 from public.uploads u
                            where u.user_id = v_person.user_id and u.status = 'accepted' and u.kind = 'daily'
                              and u.local_date = v_local::date and u.received_at > p_now - interval '3 minutes')) then
      insert into public.notifications (user_id, date, kind, expires_at)
      values (v_person.user_id, v_local::date, 'reminder', public.local_moment(v_person.user_id, v_local::date, '12:00'))
      on conflict (user_id, date, kind) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;

    -- Not when the day has already been answered on the card.
    if v_local::time >= '20:00' and public.shown_change_nudge(v_person.user_id, v_local::date) is not null
       and not exists (select 1 from public.followthrough f
                        where f.user_id = v_person.user_id and f.date = v_local::date) then
      insert into public.notifications (user_id, date, kind, expires_at)
      values (v_person.user_id, v_local::date, 'followup',
              public.local_moment(v_person.user_id, v_local::date + 1, '00:00'))
      on conflict (user_id, date, kind) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;
  return v_count;
end;
$$;
