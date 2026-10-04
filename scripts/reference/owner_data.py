#!/usr/bin/env python3
"""The owner's events and workouts for the Signal check (Phase 2c, D54, D55).

  .venv/bin/python scripts/reference/owner_data.py workouts-from-export
      Reads the Health app export (private/export.zip, or
      private/apple_health_export/export.xml) and writes the workout
      summaries to private/workouts.csv. Prints how many workouts of each
      kind it found, nothing else.

  .venv/bin/python scripts/reference/owner_data.py load-events [--local]
  .venv/bin/python scripts/reference/owner_data.py load-workouts [--local]
      Signs in as you (the first time, email and password typed here; after
      that a remembered sign-in in private/) and replaces your events (from private/events.csv) or workouts (from
      private/workouts.csv) in Clarivi. Only the owner's account can do this.

  .venv/bin/python scripts/reference/owner_data.py change-password
      Sets a new Clarivi password (run it in the Mac's Terminal app).

  .venv/bin/python scripts/reference/owner_data.py reset-password [--local]
      Gives a tester a new temporary password (R63, D74). Asks for their
      email, then the temporary password twice (hidden; run it in the Mac's
      Terminal app). At their next sign-in they must choose their own.

private/events.csv has one line per event, a range for several days:
  date,end_date,type,note
  2026-02-03,2026-02-06,illness,cold
  2026-03-14,,major_event,late night
  2026-07-30,,travel,trip out
Everything in private/ stays out of the repository.
"""

from __future__ import annotations

import csv
import getpass
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402

PRIVATE = api.ROOT / 'private'
TYPES = {'illness', 'major_event', 'travel'}


def _export_xml():
    z = PRIVATE / 'export.zip'
    if z.exists():
        archive = zipfile.ZipFile(z)
        name = next(n for n in archive.namelist() if n.endswith('/export.xml') or n == 'export.xml')
        return archive.open(name)
    x = PRIVATE / 'apple_health_export' / 'export.xml'
    if x.exists():
        return open(x, 'rb')
    raise SystemExit('No Health export found. Put export.zip in the private folder.')


def _when(text: str):
    """'2026-02-01 07:00:12 -0500' to a UTC time and the offset in minutes."""
    t = datetime.strptime(text, '%Y-%m-%d %H:%M:%S %z')
    offset = int(t.utcoffset().total_seconds() // 60)
    return t, offset


def workouts_from_export() -> None:
    since = datetime.now().astimezone() - timedelta(days=400)
    rows, skipped = {}, 0
    with _export_xml() as f:
        for _, el in ET.iterparse(f, events=('end',)):
            if el.tag != 'Workout':
                if el.tag in ('Record', 'ActivitySummary'):
                    el.clear()
                continue
            start, offset = _when(el.get('startDate'))
            end, _ = _when(el.get('endDate'))
            if start >= since:
                minutes = float(el.get('duration') or 0)
                if el.get('durationUnit') == 's':
                    minutes /= 60
                elif el.get('durationUnit') == 'hr':
                    minutes *= 60
                activity = (el.get('workoutActivityType') or 'other').replace('HKWorkoutActivityType', '').lower()
                # The workouts table refuses these, and one would fail the
                # whole load: impossible lengths, and the same workout twice
                # (an app copying a watch's workout with the same start).
                if not 0 <= minutes <= 1440 or end < start:
                    skipped += 1
                    el.clear()
                    continue
                avg_hr = None
                for st in el.findall('WorkoutStatistics'):
                    if st.get('type') == 'HKQuantityTypeIdentifierHeartRate' and st.get('average'):
                        avg_hr = round(float(st.get('average')), 1)
                row = {'activity': activity, 'start_at': start.isoformat(), 'end_at': end.isoformat(),
                             'tz_offset_min': offset, 'duration_min': round(minutes, 2),
                             'avg_hr': avg_hr if avg_hr and 25 <= avg_hr <= 250 else None,
                             'source_name': (el.get('sourceName') or '')[:120]}
                # Of two copies, keep the one with heart rate (the watch's).
                key = (activity, start)
                if key in rows:
                    skipped += 1
                    if rows[key]['avg_hr'] is not None or row['avg_hr'] is None:
                        el.clear()
                        continue
                rows[key] = row
            el.clear()
    rows = list(rows.values())
    kinds = Counter(r['activity'] for r in rows)
    out = PRIVATE / 'workouts.csv'
    with open(out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['activity', 'start_at', 'end_at', 'tz_offset_min', 'duration_min', 'avg_hr',
                                          'source_name'])
        w.writeheader()
        w.writerows(rows)
    print(f'{len(rows)} workouts from the last 400 days, written to private/workouts.csv'
          f'{f" ({skipped} left out: impossible length or a copy)" if skipped else ""}:')
    for k, n in kinds.most_common():
        print(f'  {k}: {n}')


def read_events():
    rows = []
    with open(PRIVATE / 'events.csv', newline='') as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            kind = (r.get('type') or '').strip()
            if kind not in TYPES:
                raise SystemExit(f'events.csv line {i}: type must be one of {sorted(TYPES)}')
            first = date.fromisoformat(r['date'].strip())
            last = date.fromisoformat(r['end_date'].strip()) if (r.get('end_date') or '').strip() else first
            if last < first or (last - first).days > 60:
                raise SystemExit(f'events.csv line {i}: check the dates')
            note = (r.get('note') or '').strip()[:200]
            d = first
            while d <= last:
                rows.append({'date': d.isoformat(), 'type': kind, 'note': note})
                d += timedelta(days=1)
    return rows


def read_workouts():
    with open(PRIVATE / 'workouts.csv', newline='') as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r['tz_offset_min'] = int(r['tz_offset_min'])
        r['duration_min'] = float(r['duration_min'])
        r['avg_hr'] = float(r['avg_hr']) if r['avg_hr'] else None
    return rows


def load(kind: str, local: bool) -> None:
    rows = read_events() if kind == 'events' else read_workouts()
    if local:
        env = api.local_env()
        url, key = env['API_URL'], env['PUBLISHABLE_KEY']
    else:
        env = api.live_env()
        url, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(url, key)
    fn = 'replace_my_events' if kind == 'events' else 'replace_my_workouts'
    arg = 'p_events' if kind == 'events' else 'p_workouts'
    status, body = api.call(f'{url}/rest/v1/rpc/{fn}', headers, 'POST', {arg: rows})
    if status != 200:
        raise SystemExit(f'Loading failed ({status}): {body.get("message") if isinstance(body, dict) else body}')
    print(f'Loaded {body} {kind}.')


def change_password() -> None:
    """Sets a new Clarivi password for the signed-in owner. Run it in the
    Mac's Terminal app, which hides what you type. Every other session,
    including the iPhone app's, then ends, so sign in again there."""
    env = api.live_env()
    url, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(url, key)
    new = getpass.getpass('New password, at least 12 characters (hidden): ')
    if len(new) < 12:
        raise SystemExit('Use at least 12 characters.')
    if getpass.getpass('Type it again (hidden): ') != new:
        raise SystemExit('The two passwords differ. Nothing changed.')
    status, body = api.call(f'{url}/auth/v1/user', headers, 'PUT', {'password': new})
    if status != 200:
        raise SystemExit(f'The password was not changed ({status}): {body.get("msg") if isinstance(body, dict) else body}')
    # Sign straight back in, so the remembered sign-in uses the new password.
    fresh = api.sign_in(url, key, body['email'], new)
    api._save_session(url, fresh.pop('refresh_token'))
    print('Password changed. If your iPhone asks, sign in there with the new one.')


def reset_password(local: bool) -> None:
    """Resets a tester's password to a temporary one, through the
    owner-only owner-reset-password function, signed in as you. The
    secret key never leaves the server (D74). Nothing typed is printed."""
    if local:
        env = api.local_env()
        url, key = env['API_URL'], env['PUBLISHABLE_KEY']
    else:
        env = api.live_env()
        url, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(url, key)
    email = input("The tester's email: ").strip()
    temporary = getpass.getpass('A temporary password for them, at least 12 characters (hidden): ')
    if len(temporary) < 12:
        raise SystemExit('Use at least 12 characters.')
    if getpass.getpass('Type it again (hidden): ') != temporary:
        raise SystemExit('The two passwords differ. Nothing changed.')
    status, body = api.call(f'{url}/functions/v1/owner-reset-password', headers, 'POST', {'email': email, 'password': temporary})
    messages = {
        'not_found': 'No Clarivi account has that email. Nothing changed.',
        'own_account': 'That is your own account. Change your password in Settings instead.',
        'not_owner': 'Only the owner can reset passwords.',
    }
    if status != 200:
        error = body.get('error') if isinstance(body, dict) else ''
        raise SystemExit(messages.get(error, f'The password was not reset ({status}).'))
    print('Done. Give them the temporary password; at their next sign-in they choose their own.')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'workouts-from-export':
        workouts_from_export()
    elif cmd == 'change-password':
        change_password()
    elif cmd == 'reset-password':
        reset_password('--local' in sys.argv)
    elif cmd in ('load-events', 'load-workouts'):
        load(cmd.split('-')[1], '--local' in sys.argv)
    else:
        print(__doc__)
        sys.exit(2)
