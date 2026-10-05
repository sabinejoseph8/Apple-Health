"""Checks Clarivi's privacy rules from the outside, as real people (Phase 6).

On the live project, in the Mac's Terminal app:
  .venv/bin/python scripts/reference/privacy_check.py
It asks for the test account's email and password (the password is hidden
and never stored) and refuses to run as the owner.

On the local copy, with two made-up accounts it creates and deletes:
  .venv/bin/python scripts/reference/privacy_check.py --local
Add --prove to also add a deliberately unprotected table for the run, which
must fail, to show the check can fail.

It prints only table and function names, counts, and pass or fail, never a
row. What it checks:
1. Signed out: no table gives a row, and no database function runs.
2. Signed in as the test account: every row it can read is its own (on the
   live project other people's rows exist, so this shows they are hidden);
   it can't write to any table directly; the owner's and the server's
   functions refuse it. Functions are only ever called with made-up ids or
   invalid input, so even a failure couldn't touch anyone's data.
3. The upload path: no token or a made-up token is refused; a new token
   works; after reissuing, the old one is refused and the new one works; an
   upload token can't read anything.
The database's own settings (row-level security on every table, who may run
each function) are checked separately with scripts/live-privacy-catalog.sql.
"""

from __future__ import annotations

import argparse
import getpass
import re
import secrets
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import api

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'supabase' / 'migrations'
LIVE_PROJECT = 'https://vuynnnrijdbvamwfauog.supabase.co'
LEAK_TABLE = 'privacy_check_leak'

# Made-up ids and dates: nobody's.
NOBODY = str(uuid.UUID(int=0))
OLD_DAY = '2000-01-03'

# Functions only the server may run, each with made-up input aimed at nobody.
SERVER_ONLY = [
    ('active_score_settings', {}),
    ('build_digest', {'p_user': NOBODY, 'p_week_start': OLD_DAY}),
    ('cron_key_ok', {'p_key': 'not-the-key'}),
    ('delete_my_data', {'p_user': NOBODY}),
    ('followthrough_open', {'p_user': NOBODY, 'p_date': OLD_DAY}),
    ('has_consent', {'p_user': NOBODY}),
    ('ingest_upload', {'p_token_hash': '0' * 64, 'p_upload': None, 'p_error': 'privacy check'}),
    ('issue_upload_token', {'p_user': NOBODY, 'p_token_hash': '0' * 64}),
    ('local_moment', {'p_user': NOBODY, 'p_date': OLD_DAY, 'p_time': '12:00'}),
    ('local_now', {'p_user': NOBODY}),
    ('queue_morning_notification', {'p_user': NOBODY}),
    ('rebuild_baselines', {'p_user': NOBODY, 'p_from': '2000-01-01', 'p_to': '2000-01-02'}),
    ('rebuild_nights', {'p_user': NOBODY, 'p_from': '2000-01-01', 'p_to': '2000-01-02'}),
    ('rebuild_status', {'p_user': NOBODY, 'p_from': '2000-01-01', 'p_to': '2000-01-02'}),
    ('recompute', {'p_user': NOBODY, 'p_from': '2000-01-01', 'p_to': '2000-01-02'}),
    ('shown_change_nudge', {'p_user': NOBODY, 'p_date': OLD_DAY}),
    ('withdraw_consent', {'p_user': NOBODY}),
]
# Server-only functions that take no person (build_due_digests,
# claim_due_notifications, plan_notifications, run_analysis_queue,
# send_due_notifications) are left to the catalog check: calling them, if
# a rule were broken, would do real work.

# Owner-only functions, with input they would refuse even if run.
OWNER_ONLY = [
    ('owner_status', {}),
    ('replace_my_events', {'p_events': 'not a list'}),
    ('replace_my_workouts', {'p_workouts': 'not a list'}),
]

# Functions for signed-in people; signed out, each must refuse.
SIGNED_IN_ONLY = [
    ('consent_version', {}),
    ('forget_all_devices', {}),
    ('give_consent', {'p_version': 1, 'p_use': True, 'p_us_storage': True}),
    ('log_notification_tap', {'p_id': 0}),
    ('log_usage', {'p_event': 'card_view', 'p_meta': {}}),
    ('record_shown', {'p_date': OLD_DAY}),
    ('register_push', {'p_endpoint': 'https://push.example.invalid/x', 'p_p256dh': 'x', 'p_auth': 'x'}),
    ('status_zones', {}),
    ('submit_checkin', {'p_date': OLD_DAY, 'p_answer': 'okay'}),
    ('submit_followthrough', {'p_date': OLD_DAY, 'p_answer': 'yes', 'p_channel': 'card'}),
]


def tables_from_migrations() -> List[str]:
    """Every table the migrations create in the public schema."""
    found = set()
    for path in sorted(MIGRATIONS.glob('*.sql')):
        found.update(re.findall(r'create table (?:if not exists )?public\.([a-z_]+)', path.read_text(), re.I))
    return sorted(found)


def refused(status: int, body) -> bool:
    """Did the database say no (no permission, or not allowed by the rules)?"""
    code = body.get('code') if isinstance(body, dict) else None
    return status in (401, 403) or code == '42501'


def no_rows(status: int, body) -> bool:
    return refused(status, body) or (status == 200 and body == [])


class Report:
    def __init__(self) -> None:
        self.passed = 0
        self.failed: List[str] = []

    def check(self, ok: bool, what: str) -> None:
        print(('PASS  ' if ok else 'FAIL  ') + what)
        if ok:
            self.passed += 1
        else:
            self.failed.append(what)


def sign_in(url: str, key: str, email: str, password: str) -> Tuple[Dict[str, str], dict]:
    status, body = api.call(f'{url}/auth/v1/token?grant_type=password', {'apikey': key}, 'POST',
                            {'email': email, 'password': password})
    if status != 200:
        raise SystemExit('Sign-in failed. Check the email and password.')
    return {'apikey': key, 'Authorization': f"Bearer {body['access_token']}"}, body['user']


def ping(url: str, token: Optional[str]):
    headers = {'Authorization': f'Bearer {token}'} if token else {}
    return api.call(f'{url}/functions/v1/ingest', headers, 'POST',
                    {'schema_version': 1, 'kind': 'ping', 'device_tz_offset_min': -300})


def new_token(url: str, session: Dict[str, str], password: str) -> Optional[str]:
    status, body = api.call(f'{url}/functions/v1/account-token', session, 'POST', {'password': password})
    return body.get('token') if status == 200 and isinstance(body, dict) else None


def run_checks(url: str, key: str, session: Dict[str, str], me: str, password: str, tables: List[str]) -> Report:
    report = Report()
    anon = {'apikey': key}

    print('\n1. Signed out')
    for t in tables:
        status, body = api.call(f'{url}/rest/v1/{t}?select=*&limit=1', anon)
        report.check(no_rows(status, body), f'{t}: no rows for someone signed out')
    for name, args in SERVER_ONLY + OWNER_ONLY + SIGNED_IN_ONLY:
        status, body = api.call(f'{url}/rest/v1/rpc/{name}', anon, 'POST', args)
        report.check(refused(status, body), f'{name}(): refuses someone signed out')

    print('\n2. Signed in as the test account')
    status, body = api.call(f'{url}/rest/v1/profiles?select=user_id', session)
    report.check(status == 200 and body == [{'user_id': me}], 'its own profile is readable, and only that one')
    for t in tables:
        others = f'{url}/rest/v1/{t}?select=user_id&user_id=neq.{me}&limit=1'
        status, body = api.call(others if t != 'score_settings' else f'{url}/rest/v1/{t}?select=*&limit=1', session)
        report.check(no_rows(status, body), f"{t}: no one else's rows")
        status, body = api.call(f'{url}/rest/v1/{t}', session, 'POST',
                                {} if t == 'score_settings' else {'user_id': me}, {'Prefer': 'return=minimal'})
        report.check(refused(status, body), f'{t}: no direct writing')
    for name, args in SERVER_ONLY + OWNER_ONLY:
        status, body = api.call(f'{url}/rest/v1/rpc/{name}', session, 'POST', args)
        report.check(refused(status, body), f'{name}(): refuses the test account')
    status, body = api.call(f'{url}/functions/v1/owner-reset-password', session, 'POST',
                            {'email': 'nobody@example.invalid', 'password': 'not-a-real-password'})
    report.check(status == 403, 'owner-reset-password: refuses the test account')

    print('\n3. The upload path')
    status, _ = ping(url, None)
    report.check(status == 401, 'an upload with no token is refused')
    status, _ = ping(url, 'clv_' + secrets.token_urlsafe(32)[:43])
    report.check(status == 401, 'an upload with a made-up token is refused')
    first = new_token(url, session, password)
    report.check(first is not None, 'a new upload token is made (password checked)')
    status, _ = ping(url, first)
    report.check(status == 200, 'the new token works')
    second = new_token(url, session, password)
    status, body = ping(url, first)
    report.check(status == 401 and isinstance(body, dict) and body.get('error') == 'token_revoked',
                 'after reissuing, the old token is refused at once')
    status, _ = ping(url, second)
    report.check(status == 200, 'and the new one works')
    status, body = api.call(f'{url}/rest/v1/uploads?select=*&limit=1', {'apikey': key, 'Authorization': f'Bearer {second}'})
    report.check(no_rows(status, body) and status != 200, 'an upload token can read nothing')
    return report


def live() -> Report:
    env = api.live_env()
    url, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    if url.rstrip('/') != LIVE_PROJECT:
        raise SystemExit('private/live.env does not point at the live Clarivi project.')
    email = input("The test account's email: ").strip()
    password = getpass.getpass("Its password (hidden): ")
    session, user = sign_in(url, key, email, password)
    if (user.get('app_metadata') or {}).get('is_owner'):
        raise SystemExit("That's the owner's account. Run this as the test account only.")
    return run_checks(url, key, session, user['id'], password, tables_from_migrations())


def psql(sql: str) -> None:
    subprocess.run(['docker', 'exec', '-i', 'supabase_db_clarivi', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
                   input=sql, text=True, check=True, capture_output=True)


def local(prove: bool) -> Report:
    env = api.local_env()
    url, key, secret = env['API_URL'], env['PUBLISHABLE_KEY'], env['SECRET_KEY']
    if not re.match(r'^http://(127\.0\.0\.1|localhost)[:/]', url):
        raise SystemExit('The local copy only.')
    admin = {'apikey': secret, 'Authorization': f'Bearer {secret}'}
    made = []
    try:
        people = {}
        for who in ('tester', 'someone-else'):
            email, password = f'privacy-{who}-{secrets.token_hex(4)}@example.test', secrets.token_urlsafe(18)
            status, body = api.call(f'{url}/auth/v1/admin/users', admin, 'POST',
                                    {'email': email, 'password': password, 'email_confirm': True})
            if status != 200:
                raise SystemExit(f'Could not make a local account ({status}).')
            made.append(body['id'])
            people[who] = (email, password)
        # Both agree to the consent text (D79), as real people do first.
        for who in people:
            session_, _ = sign_in(url, key, *people[who])
            api.call(f'{url}/rest/v1/rpc/give_consent', session_, 'POST', {'p_version': 1, 'p_use': True, 'p_us_storage': True})
        # Someone else uses the app a little, so there are rows to hide.
        other, _ = sign_in(url, key, *people['someone-else'])
        api.call(f'{url}/rest/v1/rpc/submit_checkin', other, 'POST', {'p_date': '2026-10-04', 'p_answer': 'okay'})
        api.call(f'{url}/rest/v1/rpc/log_usage', other, 'POST', {'p_event': 'card_view', 'p_meta': {}})
        ping(url, new_token(url, other, people['someone-else'][1]))
        tables = tables_from_migrations()
        if prove:
            psql(f'create table public.{LEAK_TABLE} (user_id uuid); '
                 f"insert into public.{LEAK_TABLE} values ('{made[1]}'); "
                 f'grant select on public.{LEAK_TABLE} to anon, authenticated;')
            tables = tables + [LEAK_TABLE]
        session, user = sign_in(url, key, *people['tester'])
        return run_checks(url, key, session, user['id'], people['tester'][1], tables)
    finally:
        if prove:
            psql(f'drop table if exists public.{LEAK_TABLE};')
        for uid in made:
            api.call(f'{url}/auth/v1/admin/users/{uid}', admin, 'DELETE')


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--local', action='store_true', help='check the local copy with made-up accounts')
    parser.add_argument('--prove', action='store_true', help='with --local, add an unprotected table that must fail')
    args = parser.parse_args(argv)
    if args.prove and not args.local:
        parser.error('--prove works only with --local')
    report = local(args.prove) if args.local else live()
    print(f'\n{report.passed} passed, {len(report.failed)} failed.')
    for what in report.failed:
        print(f'  failed: {what}')
    return 1 if report.failed else 0


if __name__ == '__main__':
    sys.exit(main())
