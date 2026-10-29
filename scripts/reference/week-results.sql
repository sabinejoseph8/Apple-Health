-- Test results for one week (Phase 8). Read-only. It returns totals only, never a reading.
--
-- How to use: run it in the Supabase SQL editor, or through any read-only connection, after
-- setting the two values in `params`: the Monday the week starts and the owner's time zone.
-- Week one is 2026-10-19; week two's date is set when it starts.
--
-- The counting rules below were written on 29 October 2026, before week one's results were
-- computed, and week two uses them unchanged (D9, D91: the targets do not change once results
-- arrive). They are the rules for how a target is counted, not the targets themselves, which are
-- in docs/product-spec.md section 9.
--
--   Sync (6 of 7 days). Three counts, so none can be read as another:
--     sync_a  days with at least one accepted daily post. This is how week one's 4 of 7 was
--             counted when D94 recorded it, and the number stays as recorded.
--     sync_b  days the morning's status was worked out and shown (by notification or on the card)
--             before noon. This is what a successful morning sync is for (R28, R29).
--             sync_b is week two's headline (D99, Sabine, 29 October 2026). Week one's recorded
--             4 of 7 (D94) used sync_a and stays as recorded.
--     sync_c  days with an accepted post that carried the whole night.
--   Notifications (90%). Of the days a status was shown, the days its morning notification was
--             sent without error. Taps are not part of this target.
--   Engagement (5 of 7 days). Days the card was opened (a card_view event) or the morning
--             notification was tapped.
--   Quiet by default (about 1 day in 7). Of the days a status was shown, the days the first status
--             shown was Ease off or Rest. The year figures use the daily_status table as it
--             stands: the version 3 count is every Ease off and Rest day; the version 2 count
--             leaves out the days the sleep floor alone moved to Ease off.
--   Check-ins against status. Of the days a status was shown and a first check-in was answered,
--             the days they agree: great or okay on Ready, off on Ease off or Rest. The first
--             answer counts (D33); an answer changed later is not used.
--   Check-in completion. Days with a check-in answered, out of days the card was opened.
--   Action. Of the days an Ease off or Rest status was shown (change days), the days the
--             follow-through question was answered.
--   Partial data. Days a status was shown that rested on fewer than three readings.
--
-- Isolation and correctness are not counted here: they come from the database tests, the privacy
-- check and the reference check (docs/mvp.md, week one's results).

with params as (
  select date '2026-10-19' as week_start, 'America/Cayman'::text as tz
),
who as (
  select user_id from public.profiles where is_owner limit 1
),
days as (
  select (p.week_start + g)::date as d from params p, generate_series(0, 6) g
),
-- The first status shown each day (what she was actually shown, kept permanently).
shown as (
  select distinct on (s.date) s.date as d, s.status, s.readings_used, s.shown_at
    from public.shown_status s, who, days
   where s.user_id = who.user_id and s.date = days.d
   order by s.date, s.shown_at
),
shown_before_noon as (
  select s.d from shown s, params p where (s.shown_at at time zone p.tz)::time < time '12:00'
),
posted as (
  select distinct u.local_date as d from public.uploads u, who, days
   where u.user_id = who.user_id and u.local_date = days.d and u.kind = 'daily' and u.status = 'accepted'
),
night_posted as (
  select distinct u.local_date as d from public.uploads u, who, days
   where u.user_id = who.user_id and u.local_date = days.d and u.kind = 'daily' and u.status = 'accepted'
     and u.night_complete
),
morning_sent as (
  select n.date as d from public.notifications n, who, days
   where n.user_id = who.user_id and n.date = days.d and n.kind = 'morning' and n.status = 'sent'
),
opened as (
  select (e.at at time zone p.tz)::date as d
    from public.usage_events e, who, params p
   where e.user_id = who.user_id and e.event = 'card_view'
  union
  select n.date from public.notifications n, who
   where n.user_id = who.user_id and n.kind = 'morning' and n.tapped_at is not null
),
opened_in_week as (
  select distinct o.d from opened o join days using (d)
),
first_checkin as (
  select c.date as d, c.answer from public.checkins c, who, days
   where c.user_id = who.user_id and c.date = days.d and c.is_first
),
followed as (
  select distinct f.date as d from public.followthrough f, who, days
   where f.user_id = who.user_id and f.date = days.d
),
year_days as (
  select ds.status, ds.sleep_floor
    from public.daily_status ds, who, params p
   where ds.user_id = who.user_id and ds.date <= p.week_start + 6 and ds.status <> 'none'
)
select * from (
  select 1 as o, 'Sync' as target, 'sync_a: days with an accepted daily post' as measure,
         (select count(*) from posted) as n, 7 as out_of
  union all select 2, 'Sync', 'sync_b: status shown before noon', (select count(*) from shown_before_noon), 7
  union all select 3, 'Sync', 'sync_c: post carried the whole night', (select count(*) from night_posted), 7
  union all select 4, 'Notifications', 'days with a status shown whose morning notification was sent',
         (select count(*) from shown s where s.d in (select d from morning_sent)), (select count(*) from shown)
  union all select 5, 'Engagement', 'days the card was opened or the notification tapped', (select count(*) from opened_in_week), 7
  union all select 6, 'Quiet by default', 'week: days the first status shown was Ease off or Rest',
         (select count(*) from shown where status in ('ease_off', 'rest')), (select count(*) from shown)
  union all select 7, 'Quiet by default', 'year, version 3: Ease off or Rest days',
         (select count(*) from year_days where status in ('ease_off', 'rest')), (select count(*) from year_days)
  union all select 8, 'Quiet by default', 'year, version 2: Ease off or Rest days (sleep floor days left out)',
         (select count(*) from year_days where status in ('ease_off', 'rest') and not coalesce(sleep_floor, false)),
         (select count(*) from year_days)
  union all select 9, 'Check-ins against status', 'days the first check-in agrees with the status shown',
         (select count(*) from shown s join first_checkin c using (d)
           where (c.answer in ('great', 'okay') and s.status = 'ready')
              or (c.answer = 'off' and s.status in ('ease_off', 'rest'))),
         (select count(*) from shown s join first_checkin c using (d))
  union all select 10, 'Check-in completion', 'days a check-in was answered, out of days the card was opened',
         (select count(*) from first_checkin where d in (select d from opened_in_week)), (select count(*) from opened_in_week)
  union all select 11, 'Action', 'change days (Ease off or Rest shown) with the follow-through question answered',
         (select count(*) from shown where status in ('ease_off', 'rest') and d in (select d from followed)),
         (select count(*) from shown where status in ('ease_off', 'rest'))
  union all select 12, 'Partial data', 'days a status was shown on fewer than three readings',
         (select count(*) from shown where readings_used < 3), (select count(*) from shown)
) r
order by o;
