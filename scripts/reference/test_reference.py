"""Checks the reference against the agreed examples, without a database.

The same cases as supabase/tests/database/04 to 07 (29 September's night,
overlapping records, the 6pm-to-noon night, the design's sample day), so the
reference and the SQL are each held to the written rules, and to each other
by check.py. Run: .venv/bin/python -m unittest discover -s scripts/reference
"""

from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reference as ref  # noqa: E402

S1 = ref.SETTINGS[1]


def samples(rows):
    df = pd.DataFrame(rows, columns=['type', 'start_at', 'end_at', 'tz_offset_min', 'value', 'stage'])
    df['start_at'] = pd.to_datetime(df['start_at'], utc=True, format='ISO8601')
    df['end_at'] = pd.to_datetime(df['end_at'], utc=True, format='ISO8601')
    return df


def stage(name, a, b, off=-300):
    return ('sleep_stage', a, b, off, None, name)


def reading(t, a, b, v, off=-300):
    return (t, a, b, off, v, None)


def every_15(a, b, v):
    return [reading('heart_rate', t, t, v) for t in pd.date_range(a, b, freq='15min', inclusive='left')]


UPLOADS = pd.DataFrame([{'received_at': pd.Timestamp('2026-10-20', tz='UTC'), 'status': 'accepted', 'kind': 'daily',
                         'local_date': date(2026, 10, 20)}])


class Nights(unittest.TestCase):
    def test_29_september(self):
        rows = [stage('core', '2026-09-28 23:00-05', '2026-09-29 02:00-05'),
                stage('awake', '2026-09-29 02:00-05', '2026-09-29 02:30-05'),
                stage('deep', '2026-09-29 02:30-05', '2026-09-29 04:00-05'),
                stage('rem', '2026-09-29 04:00-05', '2026-09-29 06:30-05'),
                stage('in_bed', '2026-09-28 22:30-05', '2026-09-29 07:00-05'),
                *every_15('2026-09-28 23:00-05', '2026-09-29 02:00-05', 50),
                *every_15('2026-09-29 02:30-05', '2026-09-29 06:30-05', 56),
                reading('heart_rate', '2026-09-29 02:10-05', '2026-09-29 02:10-05', 90),
                reading('hrv_sdnn', '2026-09-29 01:00-05', '2026-09-29 01:01-05', 40),
                reading('hrv_sdnn', '2026-09-29 03:00-05', '2026-09-29 03:01-05', 50),
                reading('hrv_sdnn', '2026-09-29 05:00-05', '2026-09-29 05:01-05', 60),
                reading('hrv_sdnn', '2026-09-29 14:00-05', '2026-09-29 14:01-05', 99),
                reading('resting_hr', '2026-09-28 00:05-05', '2026-09-29 01:00-05', 57),
                stage('core', '2026-09-29 15:00-05', '2026-09-29 15:45-05')]
        n = ref.build_nights(samples(rows), UPLOADS).set_index('night_date')
        self.assertEqual(list(n.index), [date(2026, 9, 29)])
        r = n.loc[date(2026, 9, 29)]
        self.assertEqual(r['asleep_min'], 420.0)
        self.assertEqual(r['sleeping_hr_count'], 28)
        self.assertEqual(r['sleeping_hr'], 56)
        self.assertEqual((r['hrv_median'], r['hrv_count']), (50, 3))
        self.assertEqual(r['resting_hr_prev_day'], 57)
        self.assertEqual((r['coverage'], r['confidence'], r['finished']), (1.0, 'high', True))

    def test_overlapping_records_count_once_and_awake_wins(self):
        rows = [stage('core', '2026-10-07 23:00-05', '2026-10-08 01:00-05'),
                stage('awake', '2026-10-08 01:00-05', '2026-10-08 01:30-05'),
                stage('deep', '2026-10-08 01:30-05', '2026-10-08 03:00-05'),
                stage('rem', '2026-10-08 03:00-05', '2026-10-08 06:00-05'),
                stage('deep', '2026-10-07 23:00-05', '2026-10-08 06:00-05'),
                *every_15('2026-10-07 23:00-05', '2026-10-08 06:00-05', 55)]
        r = ref.build_nights(samples(rows), UPLOADS).iloc[0]
        self.assertEqual(r['asleep_min'], 390.0)
        self.assertEqual(r['sleeping_hr_count'], 26)

    def test_night_window(self):
        rows = [stage('core', '2026-10-11 18:30-05', '2026-10-11 20:00-05'),
                stage('awake', '2026-10-11 20:00-05', '2026-10-11 23:30-05'),
                stage('core', '2026-10-11 23:30-05', '2026-10-12 05:00-05'),
                stage('deep', '2026-10-13 13:00-05', '2026-10-13 15:30-05'),
                stage('core', '2026-10-14 23:00-05', '2026-10-15 03:00-05'),
                stage('rem', '2026-10-15 11:00-05', '2026-10-15 13:00-05')]
        n = ref.build_nights(samples(rows), UPLOADS).set_index('night_date')
        self.assertEqual(list(n.index), [date(2026, 10, 12), date(2026, 10, 15)])
        self.assertEqual(n.loc[date(2026, 10, 12), 'asleep_min'], 420.0)
        self.assertEqual(n.loc[date(2026, 10, 15), 'asleep_min'], 360.0)

    def test_watch_readings_only_and_two_watches(self):
        rows = [stage('core', '2026-03-09 23:00-05', '2026-03-10 06:00-05'),
                *[r + ('Ultra Watch',) for r in every_15('2026-03-09 23:00-05', '2026-03-10 03:00-05', 55)],
                *[r + ('Second Watch',) for r in every_15('2026-03-10 03:00-05', '2026-03-10 06:00-05', 55)],
                reading('hrv_sdnn', '2026-03-10 01:00-05', '2026-03-10 01:01-05', 40) + ('Ultra Watch',),
                reading('hrv_sdnn', '2026-03-10 02:00-05', '2026-03-10 02:01-05', 90) + ('Athlytic',),
                reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 64) + ('Ultra Watch',),
                reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 58) + ('Second Watch',),
                reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 70) + ('Athlytic',)]
        rows = [r if len(r) == 7 else r + (None,) for r in rows]
        df = pd.DataFrame(rows, columns=['type', 'start_at', 'end_at', 'tz_offset_min', 'value', 'stage', 'source_name'])
        df['start_at'] = pd.to_datetime(df['start_at'], utc=True, format='ISO8601')
        df['end_at'] = pd.to_datetime(df['end_at'], utc=True, format='ISO8601')
        r = ref.build_nights(df, UPLOADS).iloc[0]
        self.assertEqual((r['hrv_median'], r['hrv_count']), (40, 1))
        self.assertEqual(r['resting_hr_prev_day'], 61)

    def test_trip_night_keeps_its_local_date(self):
        rows = [stage('core', '2026-10-01 23:00+08', '2026-10-02 07:00+08', 480)]
        r = ref.build_nights(samples(rows), UPLOADS).iloc[0]
        self.assertEqual((r['night_date'], r['tz_offset_min']), (date(2026, 10, 2), 480))


def night(d, sleep, shr, hrv, rr=15, rhr=58, finished=True):
    return {'night_date': d, 'asleep_min': sleep, 'sleeping_hr': shr, 'hrv_median': hrv,
            'hrv_count': 0 if hrv is None else 3, 'resp_rate': rr, 'resting_hr_prev_day': rhr, 'finished': finished}


def normals(d, hrv_building=False):
    out = []
    for m, med, sp, b in [('hrv', 52, 6, hrv_building), ('sleep', 430, 34, False), ('sleeping_hr', 50, 2.5, False),
                          ('resp_rate', 15, 0.5, False), ('resting_hr', 58, 2, False)]:
        out.append({'night_date': d, 'metric': m, 'median_28': med, 'mad_scaled': sp, 'valid_nights': 28,
                    'range_low': med - 2 * sp, 'range_high': med + 2 * sp, 'building': b})
    return out


class Status(unittest.TestCase):
    def build(self, nights, base):
        return ref.build_status(pd.DataFrame(nights), pd.DataFrame(base), pd.DataFrame(), S1).set_index('date')

    def test_sample_day(self):
        d = date(2026, 9, 29)
        r = self.build([night(d, 352, 51, 38)], normals(d)).loc[d]
        self.assertEqual([round(r['points'][m]['points'], 1) for m in ('hrv', 'sleep', 'sleeping_hr')], [0.9, 0.6, 0.1])
        self.assertEqual((round(r['total'], 1), r['status'], r['nudge']), (1.6, 'ease_off', 'train_easy'))
        self.assertEqual(r['reason_codes'], ['hrv_outside_range', 'sleep_outside_range', 'sleeping_hr_worse_than_normal'])
        self.assertEqual(bool(r['composite_fired']), False)

    def test_hrv_missing(self):
        d = date(2026, 9, 30)
        r = self.build([night(d, 352, 51, None)], normals(d)).loc[d]
        self.assertEqual((round(r['total'], 2), r['status'], r['nudge'], r['readings_used']),
                         (1.19, 'ease_off', 'prioritise_sleep', 2))

    def test_no_status_cases(self):
        a, b, c = date(2026, 10, 1), date(2026, 10, 2), date(2026, 10, 7)
        rows = self.build([night(a, 352, None, None), night(b, 352, 51, 38), night(c, 352, 51, 38, finished=False)],
                          normals(a) + [dict(x, building=x['metric'] in ('hrv', 'sleep')) for x in normals(b)] + normals(c))
        self.assertEqual(rows.loc[a, 'no_status_reason'], 'not_enough_data')
        self.assertEqual(rows.loc[b, 'no_status_reason'], 'learning')
        self.assertEqual(rows.loc[c, 'no_status_reason'], 'night_unfinished')

    def test_sync_today_with_no_night_yet(self):
        today, earlier = date(2026, 10, 20), date(2026, 10, 17)
        uploads = pd.DataFrame([{'status': 'accepted', 'kind': 'daily', 'local_date': d} for d in (today, earlier)])
        rows = ref.build_status(pd.DataFrame(columns=['night_date']), pd.DataFrame(columns=['night_date', 'metric']),
                                uploads, S1, today).set_index('date')
        self.assertEqual(rows.loc[today, 'no_status_reason'], 'night_unfinished')
        self.assertEqual(rows.loc[earlier, 'no_status_reason'], 'not_enough_data')

    def test_version_2_moves_the_lines(self):
        d = date(2026, 9, 30)
        r = ref.build_status(pd.DataFrame([night(d, 352, 51, None)]), pd.DataFrame(normals(d)), pd.DataFrame(),
                             ref.SETTINGS[2]).set_index('date').loc[d]
        self.assertEqual((round(r['total'], 2), r['status']), (1.19, 'ready'))

    def test_illness_check(self):
        d = date(2026, 10, 8)
        r = self.build([night(d, 430, 53, 45, rr=15.6)], normals(d)).loc[d]
        self.assertEqual(bool(r['composite_fired']), True)
        self.assertEqual(r['status'], 'ready')


class Normals(unittest.TestCase):
    def test_28_night_example(self):
        nights = pd.DataFrame([night(date(2026, 8, 31) + pd.Timedelta(days=i).to_pytimedelta(), 400 + i, 50, i)
                               for i in range(1, 29)] + [night(date(2026, 9, 29), 300, 70, 1000)])
        b = ref.build_baselines(nights, S1).set_index(['night_date', 'metric'])
        r = b.loc[(date(2026, 9, 29), 'hrv')]
        self.assertEqual(r['median_28'], 14.5)
        self.assertAlmostEqual(r['mad_scaled'], 10.3782, places=4)
        self.assertFalse(r['building'])


if __name__ == '__main__':
    unittest.main()
