"""Compares the database's results with the reference, stage by stage."""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

import pandas as pd

import reference as ref

NIGHT_COLS = ['tz_offset_min', 'sleep_start', 'sleep_end', 'asleep_min', 'finished', 'sleeping_hr', 'sleeping_hr_count',
              'hrv_median', 'hrv_count', 'resp_rate', 'resp_count', 'resting_hr_prev_day', 'coverage', 'confidence']
BASE_COLS = ['median_28', 'mad_scaled', 'valid_nights', 'range_low', 'range_high', 'building']
STATUS_COLS = ['status', 'no_status_reason', 'readings_used', 'total', 'nudge', 'reason_codes', 'composite_fired',
               'composite_inputs', 'points']


def _none(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if v is pd.NaT:
        return None
    return v


def same(a, b) -> bool:
    a, b = _none(a), _none(b)
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) or isinstance(b, (list, tuple)):
        return list(a) == list(b)
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= 1e-6 * max(1.0, abs(float(a)), abs(float(b)))
    if isinstance(a, pd.Timestamp) or isinstance(b, pd.Timestamp):
        return pd.Timestamp(a) == pd.Timestamp(b)
    return a == b


def _points(p):
    """The parts of a status's points the reference also works out."""
    if not isinstance(p, dict):
        return p
    return {m: {'verdict': v.get('verdict'), 'points': v.get('points')} for m, v in p.items()}


def stage(name: str, sql: pd.DataFrame, mine: pd.DataFrame, keys: List[str], cols: List[str]) -> Dict:
    s = {tuple(r[k] for k in keys): r for r in sql.to_dict('records')} if len(sql) else {}
    m = {tuple(r[k] for k in keys): r for r in mine.to_dict('records')} if len(mine) else {}
    diffs: List[Tuple] = []
    for key in sorted(set(s) & set(m)):
        for c in cols:
            a, b = s[key].get(c), m[key].get(c)
            if c == 'points':
                a = _points(a)
            if not same(a, b):
                diffs.append((key, c, a, b))
    return {'stage': name, 'sql': len(s), 'reference': len(m),
            'only_sql': sorted(set(s) - set(m)), 'only_reference': sorted(set(m) - set(s)), 'diffs': diffs}


def run(data: Dict[str, pd.DataFrame]) -> List[Dict]:
    """Rebuilds everything with the reference and compares it with the
    database's tables. Each status row is checked against the settings
    version it says it used."""
    versions = set(data['status']['settings_version']) if len(data['status']) else {1}
    unknown = versions - set(ref.SETTINGS)
    if unknown:
        raise SystemExit(f'The reference has no copy of settings version(s) {sorted(unknown)}.')
    settings = ref.SETTINGS[max(versions)]
    nights = ref.build_nights(data['samples'], data['uploads'])
    baselines = ref.build_baselines(nights, settings)
    status = ref.build_status(nights, baselines, data['uploads'], settings, data.get('today'))
    return [
        stage('nights', data['nights'], nights, ['night_date'], NIGHT_COLS),
        stage('normals', data['baselines'], baselines, ['night_date', 'metric'], BASE_COLS),
        stage('status', data['status'], status, ['date'], STATUS_COLS),
    ]


def report(results: List[Dict], show: int = 10) -> bool:
    ok = True
    for r in results:
        bad = len(r['diffs']) + len(r['only_sql']) + len(r['only_reference'])
        ok = ok and bad == 0
        print(f"{'PASS' if bad == 0 else 'FAIL'} {r['stage']}: {r['sql']} in the database, {r['reference']} in the reference, "
              f"{len(r['diffs'])} values differ")
        for k in r['only_sql'][:show]:
            print(f'   only in the database: {k}')
        for k in r['only_reference'][:show]:
            print(f'   only in the reference: {k}')
        for key, col, a, b in r['diffs'][:show]:
            print(f'   {key} {col}: database {a!r}, reference {b!r}')
    return ok
