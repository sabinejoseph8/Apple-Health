-- Phase 5: the owner's status page (R64). For each person: the last
-- successful sync, the days that needed the 11:30 reminder (flagged after two
-- in a row), notifications that failed in the last two days, and import
-- progress; and how full the database is (the free plan's limit is 500 MB,
-- with an alert from 400 MB). Operational facts only, never a health value.
-- Only the owner can run it; it works out who is asking from the session.
create function public.owner_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not exists (select 1 from public.profiles where user_id = v_user and is_owner) then
    raise exception 'only the owner can see this' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'database_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'people', (
      select coalesce(jsonb_agg(person order by person ->> 'is_owner' desc, person ->> 'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'name', coalesce(nullif(p.display_name, ''), u.email),
                   'is_owner', p.is_owner,
                   'last_sync', (select max(x.received_at) from public.uploads x
                                  where x.user_id = p.user_id and x.status = 'accepted' and x.kind = 'daily'),
                   -- Reminder dates are local, so the windows use the person's local date.
                   'reminder_days', (select coalesce(jsonb_agg(n.date order by n.date desc), '[]'::jsonb)
                                       from public.notifications n
                                      where n.user_id = p.user_id and n.kind = 'reminder'
                                        and n.date > coalesce(public.local_now(p.user_id)::date, current_date) - 14),
                   'reminders_in_a_row', exists (
                       select 1 from public.notifications a
                         join public.notifications b on b.user_id = a.user_id and b.kind = 'reminder' and b.date = a.date + 1
                        where a.user_id = p.user_id and a.kind = 'reminder'
                          and a.date > coalesce(public.local_now(p.user_id)::date, current_date) - 7),
                   'failures', (select count(*) from public.notifications n
                                 where n.user_id = p.user_id and n.status = 'failed' and n.created_at > now() - interval '2 days'),
                   'import_months', (
                       select case when max(x.local_date) is null then null else (
                                select count(distinct y.month_id) from public.uploads y
                                 where y.user_id = p.user_id and y.kind = 'backfill' and y.status = 'accepted' and y.month_complete
                                   and y.month_id between to_char(max(x.local_date) - interval '11 months', 'YYYY-MM')
                                                      and to_char(max(x.local_date), 'YYYY-MM')) end
                         from public.uploads x
                        where x.user_id = p.user_id and x.kind = 'backfill' and x.status = 'accepted')
                 ) as person
            from public.profiles p
            join auth.users u on u.id = p.user_id
        ) people
    )
  );
end;
$$;

revoke all on function public.owner_status() from public, anon;
grant execute on function public.owner_status() to authenticated;
