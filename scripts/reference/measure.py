#!/usr/bin/env python3
"""Measures the Signal on the owner's year (Phase 2c; D9; mvp.md A2).

  .venv/bin/python scripts/reference/measure.py --live

Signs in as you (the first time, email and password typed here; after
that a remembered sign-in in private/), rebuilds your
year with the pandas reference, and prints, for the current settings and a
few alternatives:
  - how often Ease off or Rest fire (target: no more than about 1 day in 7)
  - how many disrupted days were called Ease off or Rest (target: at least
    2 in 3), with the list of disrupted days
  - how often each reading is missing, and how many days have no status
  - the days the illness note showed
Nothing is saved; the alternatives are only tried here, never in Clarivi.

Disrupted mornings (D55): each day of illness; the morning after a travel day
or a major event; the morning of a day whose workouts were far below your
usual for that activity (D60, see disrupted_mornings).
"""

from __future__ import annotations

import copy
import sys
from datetime import timedelta
from pathlib import Path
from typing import Dict, List

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402
import reference as ref  # noqa: E402


def disrupted_mornings(events: pd.DataFrame, workouts: pd.DataFrame, watches=None) -> Dict:
    """Disrupted morning date -> what made it disrupted. Only workouts from
    the user's Watches count (R15, D56), when the Watches are given.

    Workouts are judged by day (D60): an activity's sessions on one day are
    added up (a session saved in parts isn't a disruption), sessions over 3
    hours are left out (a workout left running), and a day is far below usual
    when its total is under half the median of that activity's earlier days
    in the previous 12 weeks, or its average heart rate (weighted by minutes)
    is under 90% of their median, with at least 4 earlier days.
    """
    out: Dict = {}
    for e in events.to_dict('records'):
        d = e['date'] if e['type'] == 'illness' else e['date'] + timedelta(days=1)
        out.setdefault(d, set()).add(e['type'] + (f" ({e['note']})" if e.get('note') else ''))
    if watches is not None and len(workouts):
        workouts = workouts[workouts['source_name'].fillna('').isin(watches)]
    if not len(workouts):
        return out
    w = workouts[workouts['duration_min'] <= 180].copy()
    w['local_date'] = [ref.local_time(s, o).date() for s, o in zip(w['start_at'], w['tz_offset_min'])]
    days = []
    for (act, day), g in w.groupby(['activity', 'local_date']):
        with_hr = g[g['avg_hr'].notna()]
        hr_min = with_hr['duration_min'].sum()
        days.append({'activity': act, 'day': day, 'start': g['start_at'].min(), 'minutes': g['duration_min'].sum(),
                     'avg_hr': (with_hr['avg_hr'] * with_hr['duration_min']).sum() / hr_min if hr_min > 0 else None})
    for act, g in pd.DataFrame(days).sort_values('start').groupby('activity'):
        rows = g.to_dict('records')
        for i, r in enumerate(rows):
            before = [p for p in rows[:i] if r['start'] - pd.Timedelta(weeks=12) <= p['start'] < r['start']]
            if len(before) < 4:
                continue
            usual = ref.median(p['minutes'] for p in before)
            hrs = [p['avg_hr'] for p in before if p['avg_hr'] is not None and p['avg_hr'] == p['avg_hr']]
            easier = (r['avg_hr'] is not None and r['avg_hr'] == r['avg_hr'] and len(hrs) >= 4
                      and r['avg_hr'] < 0.9 * ref.median(hrs))
            if r['minutes'] < 0.5 * usual or easier:
                out.setdefault(r['day'], set()).add(f'{act} far below usual')
    return out


def summarise(name: str, data: Dict[str, pd.DataFrame], settings: dict, disrupted: Dict, nights=None, show=False):
    nights = ref.build_nights(data['samples'], data['uploads']) if nights is None else nights
    base = ref.build_baselines(nights, settings)
    st = ref.build_status(nights, base, data['uploads'], settings).set_index('date')
    scored = st[st['status'] != 'none']
    flagged = scored[scored['status'].isin(['ease_off', 'rest'])]
    d_days = [d for d in sorted(disrupted) if d in st.index]
    d_scored = [d for d in d_days if st.loc[d, 'status'] != 'none']
    caught = [d for d in d_scored if st.loc[d, 'status'] in ('ease_off', 'rest')]
    rate = len(flagged) / len(scored) if len(scored) else 0
    share = len(caught) / len(d_scored) if d_scored else 0
    print(f"{name}: {len(scored)} days with a status ({len(scored['status'][scored['status'] == 'ease_off'])} Ease off, "
          f"{len(scored['status'][scored['status'] == 'rest'])} Rest): fires on {rate:.0%} (1 in {1 / rate if rate else 0:.1f}); "
          f"caught {len(caught)} of {len(d_scored)} disrupted days with a status ({share:.0%}); "
          f"{(st['status'] == 'none').sum()} days without a status")
    if show:
        print('\nDisrupted mornings:')
        for d in sorted(disrupted):
            if d in st.index:
                r = st.loc[d]
                total = '' if r['total'] is None or r['total'] != r['total'] else f" {r['total']:.2f}"
                print(f"  {d}  {r['status']}{total}  {r['no_status_reason'] or ''}  <- {', '.join(sorted(disrupted[d]))}")
            else:
                print(f"  {d}  no night or sync  <- {', '.join(sorted(disrupted[d]))}")
        n = len(nights)
        hrv_min = settings['per_metric_overrides'].get('hrv', {}).get('min_count', 1)
        print(f'\nReadings missing, of {n} nights: HRV {(nights["hrv_count"] < hrv_min).sum()}, '
              f'sleeping heart rate {nights["sleeping_hr"].isna().sum()}, breathing rate {nights["resp_rate"].isna().sum()}, '
              f'resting heart rate {nights["resting_hr_prev_day"].isna().sum()}')
        reasons = st['no_status_reason'].value_counts().to_dict()
        print(f'Days without a status: {reasons}')
        ill = [d for d in st.index if st.loc[d, 'composite_fired'] is True or st.loc[d, 'composite_fired'] == True]  # noqa: E712
        print(f'Illness note showed on {len(ill)} days: {", ".join(str(d) for d in ill)}')
        print()
    return nights


def variants() -> List:
    base = ref.SETTINGS[max(ref.SETTINGS)]
    out = []

    def v(name, **changes):
        s = copy.deepcopy(base)
        for k, val in changes.items():
            if k == 'overrides':
                s['per_metric_overrides'] = val
            else:
                s[k] = val
        out.append((name, s))

    v('Starting numbers (version 1)', **{k: ref.SETTINGS[1][k] for k in ('window_nights', 'ease_off_at', 'rest_at')})
    v('Ease off from 1, Rest from 2', ease_off_at=1.0, rest_at=2.0)
    v('Ease off from 1.5, Rest from 3', ease_off_at=1.5, rest_at=3.0)
    v('Window 28 nights, 14 valid', window_nights=28, min_valid_nights=14)
    v('Sleep 35%, HRV 35%, sleeping HR 30%', weights={'hrv': 0.35, 'sleeping_hr': 0.30, 'sleep': 0.35})
    v('HRV needs 2 readings', overrides={'hrv': {'min_count': 2}})
    return out


if __name__ == '__main__':
    if '--live' not in sys.argv:
        print(__doc__)
        sys.exit(2)
    env = api.live_env()
    headers = api.owner_session(env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY'])
    data = api.load(env['SUPABASE_URL'], headers)
    hr = data['samples'][data['samples']['type'] == 'heart_rate']
    watches = set(hr['source_name'].dropna()) - {''}
    from_watch = data['workouts']['source_name'].fillna('').isin(watches).sum() if len(data['workouts']) else 0
    disrupted = disrupted_mornings(data['events'], data['workouts'], watches)
    print(f"{len(data['events'])} event days and {from_watch} Watch workouts (of {len(data['workouts'])}) give "
          f"{len(disrupted)} disrupted mornings.\n")
    current = max(ref.SETTINGS)
    nights = summarise(f'Current settings (version {current})', data, ref.SETTINGS[current], disrupted, show=True)
    for name, s in variants():
        summarise(name, data, s, disrupted, nights=nights)
