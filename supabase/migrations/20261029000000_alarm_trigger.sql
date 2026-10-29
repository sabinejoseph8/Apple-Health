-- D94: a morning sync can also start when the person stops their alarm. Its
-- runs are logged as "alarm", apart from the charger and app automations, so
-- week two can show which trigger did the work.
alter table public.uploads drop constraint uploads_run_trigger_check;
alter table public.uploads add constraint uploads_run_trigger_check
  check (run_trigger in ('charger', 'app', 'manual', 'button', 'alarm'));
