-- Code review of Phase 10 (10 November 2026), released with D121: when no sync completed the night
-- (a night the Watch recorded without stages never does), synced_after_noon used the day's latest
-- sync. A status that reached her at 9am was then marked late, with no nudge, once the app synced
-- again in the afternoon. Now the fallback is the first sync after last night's sleep ended, the
-- first that could have carried the night; only with no night at all, the latest sync as before.
-- Same signature and privileges.
create or replace function public.synced_after_noon(p_user uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(min(u.received_at) filter (where u.night_complete),
                     min(u.received_at) filter (where u.received_at >= n.sleep_end),
                     max(u.received_at))
       from public.uploads u
       left join public.nights n on n.user_id = u.user_id and n.night_date = p_date
      where u.user_id = p_user and u.status = 'accepted' and u.kind = 'daily' and u.local_date = p_date)
      >= public.local_moment(p_user, p_date, '12:00'),
    false)
$$;

revoke all on function public.synced_after_noon(uuid, date) from public, anon, authenticated;
