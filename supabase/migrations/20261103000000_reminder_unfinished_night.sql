-- D103 (30 October 2026): the 11:30 reminder goes when today's status is not in and a sync
-- could still give it, not only when no post at all has arrived that day. A partial post (the
-- night not finished) used to silence it: seen on 22 and 30 October, when a post at 11:26 left
-- the night unfinished and no reminder came. Backward compatible: the same function, the
-- same signature and privileges, one changed rule. The 8pm question is untouched.
--
-- Not sent when a status is in, nor when the reason is one a sync cannot fix (still learning
-- the normals, or too many readings missing), nor when a post arrived in the last 3 minutes,
-- which the analysis queue is still working out.
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
                          and (d.status <> 'none' or d.no_status_reason in ('learning', 'not_enough_data')))
       and not exists (select 1 from public.uploads u
                        where u.user_id = v_person.user_id and u.status = 'accepted' and u.kind = 'daily'
                          and u.local_date = v_local::date and u.received_at > p_now - interval '3 minutes') then
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
