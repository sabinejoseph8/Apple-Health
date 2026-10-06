-- Consent text version 2 (D85, 6 October 2026): the only change is "your own
-- usual range" instead of "your own normal", from Sabine's wording review.
-- Everyone agrees once more; until they do, uploads are refused and the app
-- shows the consent screen. Release the app first, then this.
create or replace function public.consent_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;
