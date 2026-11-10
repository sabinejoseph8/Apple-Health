-- D115, Phase 10: the native iPhone app syncs Health itself. Its runs are
-- logged apart from the Shortcut's automations, so the first test days show
-- which sync did the work each morning: when the app opens (health_open),
-- when Health delivers new sleep data in the background (health_background)
-- and from the card's Sync now button (health_button).
alter table public.uploads drop constraint uploads_run_trigger_check;
alter table public.uploads add constraint uploads_run_trigger_check
  check (run_trigger in ('charger', 'app', 'manual', 'button', 'alarm', 'health_open', 'health_background', 'health_button'));
