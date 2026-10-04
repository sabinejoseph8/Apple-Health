-- Phase 5: the weekly digest (R57, R58, D71, D72). The database works out
-- each week's facts; the app writes the sentences from the wording module,
-- so a different writer can replace it later (tech-spec pattern 9).

create table public.digests (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The Monday the week starts; the week runs to Sunday.
  week_start date not null check (extract(isodow from week_start) = 1),
  facts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.digests enable row level security;

create policy "digests: read own"
  on public.digests for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.digests from anon, authenticated;
grant select on public.digests to authenticated;

-- A week's facts for one person:
--   days_with_data   nights recorded, 0 to 7 (R58)
--   statuses         days by status as shown that morning (D71), or the
--                    day's status when nothing was shown
--   flagged          the Ease off and Rest days
--   readings         per score reading: nights counted, how many were below
--                    or above the normal range, and the week's average
--                    against the average normal
--   pattern_nights   nights the illness check's pattern showed
--   nudges           change days as shown, and how many were followed, not
--                    followed or unanswered (latest answer each day)
create function public.build_digest(p_user uuid, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end date := p_week_start + 6;
  v_facts jsonb;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'a week starts on a Monday' using errcode = '22023';
  end if;

  with days as (
    select d::date as day from generate_series(p_week_start, v_end, interval '1 day') as d
  ),
  first_shown as (
    select distinct on (s.date) s.date, s.status, s.nudge
      from public.shown_status s
     where s.user_id = p_user and s.date between p_week_start and v_end
     order by s.date, s.shown_at
  ),
  day_status as (
    select days.day,
           coalesce(fs.status, nullif(ds.status, 'none')) as status,
           fs.nudge as shown_nudge
      from days
      left join first_shown fs on fs.date = days.day
      left join public.daily_status ds on ds.user_id = p_user and ds.date = days.day
  ),
  answers as (
    select distinct on (f.date) f.date, f.answer
      from public.followthrough f
     where f.user_id = p_user and f.date between p_week_start and v_end
     order by f.date, f.answered_at desc
  ),
  readings as (
    select m.metric,
           count(*) filter (where p.verdict in ('below', 'above', 'in_range')) as nights,
           count(*) filter (where p.verdict = 'below') as below,
           count(*) filter (where p.verdict = 'above') as above,
           round(avg(p.value) filter (where p.verdict in ('below', 'above', 'in_range')), 1) as average,
           round(avg(p.normal) filter (where p.verdict in ('below', 'above', 'in_range')), 1) as normal
      from unnest(array['hrv', 'sleep', 'sleeping_hr']) as m(metric)
      left join lateral (
        select (ds.points -> m.metric ->> 'verdict') as verdict,
               (ds.points -> m.metric ->> 'value')::numeric as value,
               (ds.points -> m.metric ->> 'normal')::numeric as normal
          from public.daily_status ds
         where ds.user_id = p_user and ds.date between p_week_start and v_end
      ) p on true
     group by m.metric
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'week_end', v_end,
    'days_with_data', (select count(*) from public.nights n
                        where n.user_id = p_user and n.night_date between p_week_start and v_end),
    'statuses', jsonb_build_object(
      'ready', (select count(*) from day_status where status = 'ready'),
      'ease_off', (select count(*) from day_status where status = 'ease_off'),
      'rest', (select count(*) from day_status where status = 'rest'),
      'none', (select count(*) from day_status where status is null)),
    'flagged', (select coalesce(jsonb_agg(jsonb_build_object('date', day, 'status', status) order by day), '[]'::jsonb)
                  from day_status where status in ('ease_off', 'rest')),
    'readings', (select jsonb_object_agg(metric, jsonb_build_object(
                          'nights', nights, 'below', below, 'above', above, 'average', average, 'normal', normal))
                   from readings),
    'pattern_nights', (select count(*) from public.daily_status ds
                        where ds.user_id = p_user and ds.date between p_week_start and v_end and ds.composite_fired),
    'nudges', jsonb_build_object(
      'change_days', (select count(*) from day_status where shown_nudge <> 'train_as_planned'),
      'followed', (select count(*) from day_status d join answers a on a.date = d.day
                    where d.shown_nudge <> 'train_as_planned' and a.answer = 'yes'),
      'not_followed', (select count(*) from day_status d join answers a on a.date = d.day
                        where d.shown_nudge <> 'train_as_planned' and a.answer = 'no'),
      'unanswered', (select count(*) from day_status d left join answers a on a.date = d.day
                      where d.shown_nudge <> 'train_as_planned' and a.answer is null))
  ) into v_facts;

  insert into public.digests (user_id, week_start, facts) values (p_user, p_week_start, v_facts)
  on conflict (user_id, week_start) do update set facts = excluded.facts, created_at = now();
  return v_facts;
end;
$$;

-- Every hour: from 5am on Monday in each person's local time, last week's
-- digest for anyone who synced that week and doesn't have it yet (tech-spec,
-- Schedulers). No notification (D72). p_now is for tests.
create function public.build_due_digests(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_local timestamp;
  v_week date;
  v_count integer := 0;
begin
  for v_person in select p.user_id from public.profiles p where p.latest_tz_offset_min is not null loop
    v_local := public.local_now(v_person.user_id, p_now);
    if extract(isodow from v_local) = 1 and v_local::time >= '05:00' then
      v_week := v_local::date - 7;
      if not exists (select 1 from public.digests d where d.user_id = v_person.user_id and d.week_start = v_week)
         and exists (select 1 from public.uploads u
                      where u.user_id = v_person.user_id and u.status = 'accepted'
                        and u.local_date between v_week and v_week + 6) then
        perform public.build_digest(v_person.user_id, v_week);
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.build_digest(uuid, date) from public, anon, authenticated;
revoke all on function public.build_due_digests(timestamptz) from public, anon, authenticated;
grant execute on function public.build_digest(uuid, date) to service_role;
grant execute on function public.build_due_digests(timestamptz) to service_role;

select cron.schedule('build-digests', '10 * * * *', 'select public.build_due_digests()');
