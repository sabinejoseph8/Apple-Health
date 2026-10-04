"""Clarivi's reference calculation (Phase 2c, R16 and the D9 correctness gate).

An independent pandas version of the analysis the database does: nights,
normals (baselines) and the daily status. It is written from the agreed
rules (docs/mvp.md D10, D11, D35, D36, D48 to D53, D56, D57; docs/tech-spec.md
section 3), not translated from the SQL, so that the two can be compared
stage by stage on real data (scripts/reference/check.py).

Every function takes and returns plain pandas DataFrames. Times are UTC
(timezone-aware); each reading's local time is its UTC time plus its own
offset in minutes.
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

ASLEEP = ('core', 'deep', 'rem')
METRICS = ('sleeping_hr', 'hrv', 'sleep', 'resp_rate', 'resting_hr')
SCORE_METRICS = ('hrv', 'sleeping_hr', 'sleep')
# The direction that is worse than normal: lower for HRV and sleep.
WORSE = {'hrv': -1, 'sleeping_hr': 1, 'sleep': -1, 'resp_rate': 1, 'resting_hr': 1}

# Score settings by version, as agreed (score_settings in the database; users
# can't read that table, so the reference keeps its own copy).
SETTINGS: Dict[int, dict] = {
    1: {
        'weights': {'hrv': 0.40, 'sleeping_hr': 0.35, 'sleep': 0.25},
        'ease_off_at': 1.0, 'rest_at': 2.0,
        'window_nights': 28, 'min_valid_nights': 21,
        'per_metric_overrides': {'hrv': {'min_count': 1}},
        'min_spread': {'hrv': 1, 'sleeping_hr': 1, 'sleep': 10, 'resp_rate': 0.2, 'resting_hr': 1},
        'illness_spreads': 1.0, 'illness_min_markers': 3,
        'partial_cap': None,
    },
}
# Version 2, the final numbers (D59): normals from 42 nights (21 valid);
# Ease off from 1.2, Rest from 2.4; everything else as version 1.
SETTINGS[2] = {**SETTINGS[1], 'window_nights': 42, 'ease_off_at': 1.2, 'rest_at': 2.4}

MINUTE = pd.Timedelta(minutes=1)
DAY = pd.Timedelta(days=1)


def median(values) -> Optional[float]:
    """The middle value, halfway between the two middle ones for an even
    count (Postgres percentile_cont(0.5))."""
    v = sorted(float(x) for x in values)
    if not v:
        return None
    n = len(v)
    mid = n // 2
    return v[mid] if n % 2 else (v[mid - 1] + v[mid]) / 2


def _union(intervals: List[Tuple[pd.Timestamp, pd.Timestamp]]) -> List[Tuple[pd.Timestamp, pd.Timestamp]]:
    """Joins overlapping or touching intervals [start, end)."""
    out: List[List[pd.Timestamp]] = []
    for s, e in sorted(intervals):
        if s >= e:
            continue
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(s, e) for s, e in out]


def _subtract(base, cut):
    """The parts of the base intervals not covered by the cut intervals."""
    out = []
    j = 0
    for s, e in base:
        cur = s
        while j < len(cut) and cut[j][1] <= cur:
            j += 1
        k = j
        while k < len(cut) and cut[k][0] < e:
            cs, ce = cut[k]
            if cs > cur:
                out.append((cur, min(cs, e)))
            cur = max(cur, ce)
            if cur >= e:
                break
            k += 1
        if cur < e:
            out.append((cur, e))
    return out


def local_time(ts: pd.Timestamp, offset_min: int) -> pd.Timestamp:
    """A reading's local clock time: its UTC time plus its own offset."""
    return ts.tz_convert(None) + pd.Timedelta(minutes=int(offset_min))


def build_nights(samples: pd.DataFrame, uploads: pd.DataFrame) -> pd.DataFrame:
    """One row per night (D48 to D50).

    Time asleep is the time covered by an asleep stage (core, deep, REM) and
    by no awake stage, each moment once (D49). A night is all the time asleep
    in stretches starting from 6pm the evening before to noon, local time,
    dated by that morning, with at least 2 hours asleep (D50, D48).
    """
    stages = samples[samples['type'] == 'sleep_stage']
    asleep_rows = stages[stages['stage'].isin(ASLEEP)].sort_values('end_at')
    awake_rows = stages[stages['stage'] == 'awake']
    asleep = _union(list(zip(asleep_rows['start_at'], asleep_rows['end_at'])))
    awake = _union(list(zip(awake_rows['start_at'], awake_rows['end_at'])))
    stretches = _subtract(asleep, awake)

    a_start = asleep_rows['start_at'].dt.tz_convert(None).to_numpy()
    a_end = asleep_rows['end_at'].dt.tz_convert(None).to_numpy()
    a_off = asleep_rows['tz_offset_min'].to_numpy()

    placed = []
    for s, e in stretches:
        # The offset of the asleep stage the stretch starts in (the one that
        # ends first, if several cover that moment).
        t = s.tz_convert(None).to_datetime64()
        hits = np.nonzero((a_start <= t) & (a_end > t) & (a_end < t + np.timedelta64(1, 'D')))[0]
        offset = int(a_off[hits[0]])
        local_start = local_time(s, offset)
        night_date = (local_start + pd.Timedelta(hours=6)).date()
        if local_start < pd.Timestamp(night_date) + pd.Timedelta(hours=12):
            placed.append((night_date, s, e, offset))

    last_sync = None
    ok = uploads[uploads['status'] == 'accepted'] if len(uploads) else uploads
    if len(ok):
        last_sync = ok['received_at'].max()

    # Only Watch readings count (R15): a Watch is any source that records
    # heart rate (D56). Readings with no source are kept.
    src = samples['source_name'].fillna('') if 'source_name' in samples else pd.Series('', index=samples.index)
    watches = set(src[(samples['type'] == 'heart_rate') & (src != '')])
    from_watch = (src == '') | src.isin(watches)
    by_type = {t: g.sort_values('end_at') for t, g in samples[from_watch].groupby('type')}
    rows = []
    for night_date, group in pd.DataFrame(placed, columns=['night_date', 's', 'e', 'off']).groupby('night_date'):
        seconds = sum((e - s).total_seconds() for s, e in zip(group['s'], group['e']))
        asleep_min = Decimal(repr(seconds)) / 60
        if asleep_min < 120:
            continue
        sleep_start = group['s'].min()
        sleep_end = group['e'].max()
        tz_offset = int(group.sort_values('e', kind='stable').iloc[-1]['off'])
        ranges = list(zip(group['s'], group['e']))

        hr = by_type.get('heart_rate', samples.iloc[0:0])
        hr = hr[(hr['end_at'] >= sleep_start) & (hr['end_at'] < sleep_end)]

        def inside(t):
            return any(s <= t < e for s, e in ranges)

        hr = hr[np.array([inside(a) and inside(b) for a, b in zip(hr['start_at'], hr['end_at'])], dtype=bool)]
        n_hr = len(hr)
        blocks = len({math.floor(t.timestamp() / 900) for t in hr['start_at']})
        coverage = min(1.0, blocks / max(1, math.ceil(float(asleep_min) / 15)))

        def window(t):
            g = by_type.get(t, samples.iloc[0:0])
            return g[(g['end_at'] >= sleep_start) & (g['start_at'] <= sleep_end)]

        hrv = window('hrv_sdnn')
        rr = window('respiratory_rate')
        rhr_all = by_type.get('resting_hr', samples.iloc[0:0])
        day_before = night_date - pd.Timedelta(days=1).to_pytimedelta()
        rhr_local = np.array([local_time(s, o).date() == day_before for s, o in zip(rhr_all['start_at'], rhr_all['tz_offset_min'])],
                             dtype=bool)
        rhr = rhr_all[rhr_local]

        rows.append({
            'night_date': night_date,
            'tz_offset_min': tz_offset,
            'sleep_start': sleep_start,
            'sleep_end': sleep_end,
            'asleep_min': float(asleep_min.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)),
            'finished': bool(last_sync is not None and sleep_end <= last_sync - 10 * MINUTE),
            'sleeping_hr': median(hr['value']) if n_hr >= 10 else None,
            'sleeping_hr_count': n_hr,
            'hrv_median': median(hrv['value']),
            'hrv_count': len(hrv),
            'resp_rate': median(rr['value']),
            'resp_count': len(rr),
            # The median if two watches gave one for that day (D57).
            'resting_hr_prev_day': median(rhr['value']),
            'coverage': coverage,
            'confidence': 'high' if coverage >= 0.7 else 'medium' if coverage >= 0.4 else 'low',
        })
    return pd.DataFrame(rows, columns=[
        'night_date', 'tz_offset_min', 'sleep_start', 'sleep_end', 'asleep_min', 'finished', 'sleeping_hr',
        'sleeping_hr_count', 'hrv_median', 'hrv_count', 'resp_rate', 'resp_count', 'resting_hr_prev_day',
        'coverage', 'confidence'])


def _metric_value(night: dict, metric: str, hrv_min: int):
    if metric == 'hrv':
        return night['hrv_median'] if night['hrv_count'] >= hrv_min and night['hrv_median'] is not None else None
    col = {'sleeping_hr': 'sleeping_hr', 'sleep': 'asleep_min', 'resp_rate': 'resp_rate',
           'resting_hr': 'resting_hr_prev_day'}[metric]
    v = night[col]
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def _clean(nights: pd.DataFrame) -> List[dict]:
    recs = nights.to_dict('records')
    for r in recs:
        for k, v in r.items():
            if isinstance(v, float) and math.isnan(v):
                r[k] = None
    return recs


def build_baselines(nights: pd.DataFrame, settings: dict) -> pd.DataFrame:
    """Each night's normal per reading: the median of the nights in the
    window before it (never the night itself), the scaled MAD as the spread
    (with a floor), the range of 2 spreads either side, and "building" until
    enough nights have the reading (D11, D51)."""
    recs = _clean(nights)
    by_date = {r['night_date']: r for r in recs}
    hrv_min = settings['per_metric_overrides'].get('hrv', {}).get('min_count', 1)
    rows = []
    for r in recs:
        d = r['night_date']
        for m in METRICS:
            o = settings['per_metric_overrides'].get(m, {})
            window = o.get('window_nights', settings['window_nights'])
            min_valid = o.get('min_valid_nights', settings['min_valid_nights'])
            vals = []
            for k in range(1, window + 1):
                p = by_date.get(d - pd.Timedelta(days=k).to_pytimedelta())
                if p is not None:
                    v = _metric_value(p, m, hrv_min)
                    if v is not None:
                        vals.append(float(v))
            med = median(vals)
            spread = None
            if med is not None:
                spread = max(median(abs(v - med) for v in vals) * 1.4826, float(settings['min_spread'].get(m, 0)))
            rows.append({
                'night_date': d, 'metric': m, 'median_28': med, 'mad_scaled': spread, 'valid_nights': len(vals),
                'range_low': None if med is None else med - 2 * spread,
                'range_high': None if med is None else med + 2 * spread,
                'building': len(vals) < min_valid,
            })
    return pd.DataFrame(rows, columns=['night_date', 'metric', 'median_28', 'mad_scaled', 'valid_nights',
                                       'range_low', 'range_high', 'building'])


def build_status(nights: pd.DataFrame, baselines: pd.DataFrame, uploads: pd.DataFrame, settings: dict,
                 today=None) -> pd.DataFrame:
    """The daily status for every day with a night or a morning sync
    (D35, D36, D51 to D53). `today` is the user's current local date: a sync
    today with no night yet is "night not finished" (Phase 2 code review)."""
    recs = {r['night_date']: r for r in _clean(nights)}
    base = {(r['night_date'], r['metric']): r for r in _clean(baselines)}
    days = set(recs)
    if len(uploads):
        daily = uploads[(uploads['status'] == 'accepted') & (uploads['kind'] == 'daily')]
        days |= set(daily['local_date'].dropna())
    hrv_min = settings['per_metric_overrides'].get('hrv', {}).get('min_count', 1)
    w = settings['weights']
    rows = []
    for d in sorted(days):
        night = recs.get(d)
        readings = {}
        for m in METRICS:
            value = _metric_value(night, m, hrv_min) if night else None
            b = base.get((d, m))
            building = True if b is None else bool(b['building'])
            if value is None:
                verdict = 'missing'
            elif building:
                verdict = 'building'
            elif value < b['range_low']:
                verdict = 'below'
            elif value > b['range_high']:
                verdict = 'above'
            else:
                verdict = 'in_range'
            counted = verdict not in ('missing', 'building')
            deviation = (float(value) - b['median_28']) / b['mad_scaled'] if counted else None
            readings[m] = {'value': value, 'verdict': verdict, 'counted': counted, 'deviation': deviation,
                           'spreads_worse': max(0.0, WORSE[m] * deviation) if counted else None}

        used = [m for m in SCORE_METRICS if readings[m]['counted']]
        n_building = sum(readings[m]['verdict'] == 'building' for m in SCORE_METRICS)
        weight_used = sum(w[m] for m in used)
        total = sum(w[m] / weight_used * readings[m]['spreads_worse'] for m in used) if len(used) >= 2 else None

        if night is None:
            status, reason = 'none', 'night_unfinished' if d == today else 'not_enough_data'
        elif not night['finished']:
            status, reason = 'none', 'night_unfinished'
        elif n_building >= 2:
            status, reason = 'none', 'learning'
        elif len(used) < 2:
            status, reason = 'none', 'not_enough_data'
        elif total >= settings['rest_at'] and not (len(used) == 2 and settings['partial_cap'] == 'ease_off'):
            status, reason = 'rest', None
        elif total >= settings['ease_off_at']:
            status, reason = 'ease_off', None
        else:
            status, reason = 'ready', None

        raw = {m: w[m] * readings[m]['spreads_worse'] for m in SCORE_METRICS if readings[m]['counted']}
        if status == 'ready':
            nudge = 'train_as_planned'
        elif status == 'rest':
            nudge = 'rest'
        elif status == 'ease_off':
            others = max([v for m, v in raw.items() if m != 'sleep'], default=0.0)
            nudge = 'prioritise_sleep' if raw.get('sleep', 0.0) > others else 'train_easy'
        else:
            nudge = None

        reasons = []
        if status != 'none' and len(used) >= 2:
            earned = sorted((m for m in used if readings[m]['spreads_worse'] > 0), key=lambda m: (-raw[m], m))
            reasons = [m + ('_outside_range' if readings[m]['verdict'] in ('below', 'above') else '_worse_than_normal')
                       for m in earned]

        inputs = sorted(m for m in METRICS if m != 'sleep' and readings[m]['counted'])
        moved = sum(WORSE[m] * readings[m]['deviation'] >= settings['illness_spreads'] for m in inputs)
        fired = bool(moved >= settings['illness_min_markers']) if len(inputs) >= 3 else None

        rows.append({
            'date': d, 'status': status, 'no_status_reason': reason, 'readings_used': len(used),
            'total': total if status != 'none' else None, 'nudge': nudge, 'reason_codes': reasons,
            'composite_fired': fired, 'composite_inputs': inputs,
            'points': {m: {'verdict': readings[m]['verdict'],
                           'points': (w[m] / weight_used * readings[m]['spreads_worse'])
                           if readings[m]['counted'] and len(used) >= 2 else None}
                       for m in SCORE_METRICS},
        })
    return pd.DataFrame(rows, columns=['date', 'status', 'no_status_reason', 'readings_used', 'total', 'nudge',
                                       'reason_codes', 'composite_fired', 'composite_inputs', 'points'])
