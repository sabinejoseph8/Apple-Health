#!/usr/bin/env python3
"""This morning's status, in plain words, for the owner's self-test (end of
Phase 2: reading her own status each morning before the screens exist).

  .venv/bin/python scripts/reference/today.py
  .venv/bin/python scripts/reference/today.py 2026-10-02
  .venv/bin/python scripts/reference/today.py --felt off "tired, couldn't train"

--felt good, okay or off (and an optional note) saves how you felt next to
that day's status in private/selftest.csv, for the end-of-self-test review.
It stays in private/, which is never committed.

Signs in with the remembered sign-in (scripts/reference/api.py) and prints
the status, the nudge, each reading against your normal and the illness
check, for today (your local date) or the date given. Prints to this
terminal only; nothing is saved unless you use --felt. Never names a
condition (R61).
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402

STATUS = {'ready': 'Ready', 'ease_off': 'Ease off', 'rest': 'Rest'}
NO_STATUS = {
    'night_unfinished': "No status yet: last night's sleep hasn't fully arrived from your Watch.",
    'not_enough_data': 'No status: not enough data last night.',
    'learning': 'No status: still learning your normal.',
    'waiting': "No status yet: waiting for this morning's sync.",
    'no_sync': 'No status: nothing synced by noon.',
}
NUDGE = {'train_as_planned': 'Train as planned', 'train_easy': 'Train easy today', 'rest': 'Rest today',
         'prioritise_sleep': 'Prioritise sleep tonight'}
READINGS = [('hrv', 'Heart rate variability', 'ms', 0), ('sleep', 'Sleep', 'min', 0),
            ('sleeping_hr', 'Sleeping heart rate', 'beats a minute', 0)]
VERDICT = {'below': 'below your normal range', 'above': 'above your normal range', 'in_range': 'in your normal range',
           'missing': 'no reading last night', 'building': 'normal still building'}


def _sleep(minutes) -> str:
    m = int(round(float(minutes)))
    return f'{m // 60}h {m % 60:02d}m'


def show(row: dict) -> None:
    print(f"\n{row['date']}  (settings version {row['settings_version']})")
    if row['status'] == 'none':
        print(NO_STATUS.get(row['no_status_reason'], 'No status.'))
    else:
        used = row['readings_used']
        print(f"{STATUS[row['status']]}: {NUDGE[row['nudge']]}"
              + ('' if used == 3 else f'  (based on {used} of 3 readings)'))
        print(f"Points: {float(row['total']):.2f}")
    print()
    for key, name, unit, _ in READINGS:
        r = (row.get('points') or {}).get(key, {})
        value, normal = r.get('value'), r.get('normal')
        if value is None:
            line = f'  {name}: {VERDICT.get(r.get("verdict"), "")}'
        else:
            fmt = _sleep if key == 'sleep' else (lambda v: f'{float(v):.0f} {unit}')
            line = f'  {name}: {fmt(value)}'
            if normal is not None:
                line += f', normal {fmt(normal)}'
            line += f' ({VERDICT.get(r.get("verdict"), "")})'
            if r.get('points') is not None:
                line += f', {float(r["points"]):.2f} points'
        print(line)
    fired = row.get('composite_fired')
    print()
    if fired is True:
        print('Also checked: several overnight readings moved the wrong way together. This is a pattern, not a diagnosis.')
    elif fired is False:
        print('Also checked: no early sign of illness or heavy strain.')
    else:
        print('Also checked: not enough readings for the pattern check.')


def record(row: dict, day: date, felt: str, note: str) -> None:
    import csv
    path = api.ROOT / 'private' / 'selftest.csv'
    new = not path.exists()
    with open(path, 'a', newline='') as f:
        w = csv.writer(f)
        if new:
            w.writerow(['date', 'status', 'nudge', 'points', 'felt', 'note'])
        w.writerow([day.isoformat(), row.get('status', 'none') if row else 'none', (row or {}).get('nudge') or '',
                    '' if not row or row.get('total') is None else f"{float(row['total']):.2f}", felt, note])
    print(f'\nSaved: you felt {felt} on {day}.')


if __name__ == '__main__':
    args = sys.argv[1:]
    felt = note = None
    if '--felt' in args:
        i = args.index('--felt')
        felt = args[i + 1] if i + 1 < len(args) else ''
        if felt not in ('good', 'okay', 'off'):
            raise SystemExit('Use --felt good, --felt okay or --felt off.')
        note = ' '.join(args[i + 2:])
        args = args[:i]
    sys.argv = [sys.argv[0]] + args
    env = api.live_env()
    url, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(url, key)
    profiles = api.fetch(url, headers, 'profiles', 'latest_tz_offset_min', 'user_id')
    if len(sys.argv) > 1:
        day = date.fromisoformat(sys.argv[1])
    else:
        import pandas as pd
        offset = (profiles[0].get('latest_tz_offset_min') if profiles else None) or 0
        day = (pd.Timestamp.now(tz='UTC').tz_convert(None) + pd.Timedelta(minutes=int(offset))).date()
    rows = api.fetch(url, headers, 'daily_status', '*', 'date', f'date=eq.{day.isoformat()}')
    if rows:
        show(rows[0])
    else:
        print(f"\n{day}: no status yet. Nothing has synced for this morning, or last night's sleep hasn't arrived.")
    if felt:
        record(rows[0] if rows else None, day, felt, note)
