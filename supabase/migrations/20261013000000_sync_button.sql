-- The card's "Sync now" button (D84) runs the Clarivi Sync Shortcut with the
-- input "button", so its runs are logged apart from the charger and app
-- automations (the locked-phone count, D75, looks at those).
alter table public.uploads drop constraint uploads_run_trigger_check;
alter table public.uploads add constraint uploads_run_trigger_check
  check (run_trigger in ('charger', 'app', 'manual', 'button'));
