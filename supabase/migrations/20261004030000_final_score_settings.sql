-- Phase 2c: the final score numbers, version 2, frozen (D59, decided by
-- Sabine on 3 October 2026 after measuring her year; product-spec open
-- questions 1 to 3).
--
-- Measured on her year with the pandas reference (scripts/reference/
-- measure.py): version 1 fired Ease off or Rest on about 1 day in 6 and left
-- 108 of 237 days "learning your normal" (tracking gaps leave fewer than 21
-- valid nights in 28). Version 2 takes the normal from the last 42 nights
-- (still needing 21 valid) and moves Ease off to 1.2 and Rest to 2.4: about
-- 1 day in 7.5, with 27 days learning. The weights, the HRV minimum (1
-- reading), the spread floors and the illness check are unchanged, and
-- there is no cap on days scored from 2 of 3 readings (her year has none).

-- A frozen version's numbers can't change, but which version is active can,
-- so a later version can replace it before the test.
create or replace function public.score_settings_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.frozen and not (tg_op = 'UPDATE' and (to_jsonb(new) - 'active') = (to_jsonb(old) - 'active')) then
    raise exception 'score settings version % is frozen', old.version;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

update public.score_settings set active = false, frozen = true where version = 1;

insert into public.score_settings (version, weights, ease_off_at, rest_at, window_nights, min_valid_nights,
                                   per_metric_overrides, min_spread, illness_spreads, illness_min_markers,
                                   partial_cap, frozen, active, note)
select 2, weights, 1.2, 2.4, 42, 21, per_metric_overrides, min_spread, illness_spreads, illness_min_markers,
       null, true, true, 'Final numbers, set from Sabine''s year on 3 October 2026 (D59)'
  from public.score_settings where version = 1;

-- Rebuild everyone's normals and status with version 2.
insert into public.analysis_queue (user_id, from_date, to_date, reason)
select user_id, min(start_at)::date - 1, (now() at time zone 'utc')::date + 1, 'manual'
  from public.samples
 group by user_id;
