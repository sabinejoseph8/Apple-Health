"""Checks the Signal measurement on made-up data: which mornings count as
disrupted (D55), and that a full summary runs."""

from __future__ import annotations

import io
import sys
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import measure  # noqa: E402
import reference as ref  # noqa: E402
import synthetic  # noqa: E402


class Disrupted(unittest.TestCase):
    def test_which_mornings(self):
        events = pd.DataFrame([{'date': date(2026, 2, 3), 'type': 'illness', 'note': 'cold'},
                               {'date': date(2026, 3, 14), 'type': 'major_event', 'note': ''},
                               {'date': date(2026, 7, 30), 'type': 'travel', 'note': 'trip out'}])
        runs = [('2026-01-0%d 07:00-05' % d, 40.0, 150.0) for d in range(1, 6)] + [('2026-01-08 07:00-05', 15.0, 150.0),
                                                                                    ('2026-01-09 07:00-05', 40.0, 120.0)]
        workouts = pd.DataFrame([{'activity': 'running', 'start_at': pd.Timestamp(s), 'tz_offset_min': -300,
                                  'duration_min': m, 'avg_hr': h} for s, m, h in runs])
        workouts['start_at'] = pd.to_datetime(workouts['start_at'], utc=True)
        d = measure.disrupted_mornings(events, workouts)
        self.assertEqual(sorted(d), [date(2026, 1, 8), date(2026, 1, 9), date(2026, 2, 3), date(2026, 3, 15),
                                     date(2026, 7, 31)])
        self.assertEqual(d[date(2026, 2, 3)], {'illness (cold)'})

    def test_split_sessions_and_forgotten_stops(self):
        runs = [('2026-01-0%d 07:00-05' % d, 40.0) for d in range(1, 6)] + [
            ('2026-01-08 07:00-05', 3.0), ('2026-01-08 07:05-05', 37.0),  # one session saved in two parts
            ('2026-01-09 07:00-05', 231.0)]                                # a workout left running
        workouts = pd.DataFrame([{'activity': 'elliptical', 'start_at': pd.Timestamp(s), 'tz_offset_min': -300,
                                  'duration_min': m, 'avg_hr': 140.0, 'source_name': 'Test Watch'} for s, m in runs])
        workouts['start_at'] = pd.to_datetime(workouts['start_at'], utc=True)
        self.assertEqual(measure.disrupted_mornings(pd.DataFrame(columns=['date', 'type', 'note']), workouts,
                                                    {'Test Watch'}), {})

    def test_only_watch_workouts(self):
        runs = [('2026-01-0%d 07:00-05' % d, 40.0, 'Test Watch') for d in range(1, 6)] + [('2026-01-08 07:00-05', 5.0, 'Some App')]
        workouts = pd.DataFrame([{'activity': 'running', 'start_at': pd.Timestamp(s), 'tz_offset_min': -300,
                                  'duration_min': m, 'avg_hr': None, 'source_name': src} for s, m, src in runs])
        workouts['start_at'] = pd.to_datetime(workouts['start_at'], utc=True)
        self.assertEqual(measure.disrupted_mornings(pd.DataFrame(columns=['date', 'type', 'note']), workouts,
                                                    {'Test Watch'}), {})


class Summary(unittest.TestCase):
    def test_runs_on_a_made_up_history(self):
        m = synthetic.make()
        s = pd.DataFrame(m['samples'])
        s['start_at'] = pd.to_datetime(s['start_at'], utc=True)
        s['end_at'] = pd.to_datetime(s['end_at'], utc=True)
        u = pd.DataFrame(m['uploads'])
        u['status'] = 'accepted'
        u['received_at'] = pd.to_datetime(u['received_at'], utc=True)
        data = {'samples': s, 'uploads': u}
        disrupted = {date(2026, 7, 5): {'illness'}, date(2026, 7, 6): {'travel'}}
        with redirect_stdout(io.StringIO()) as out:
            nights = measure.summarise('Current', data, ref.SETTINGS[max(ref.SETTINGS)], disrupted, show=True)
            for name, settings in measure.variants():
                measure.summarise(name, data, settings, disrupted, nights=nights)
        text = out.getvalue()
        self.assertIn('Disrupted mornings:', text)
        self.assertIn('Starting numbers (version 1)', text)


if __name__ == '__main__':
    unittest.main()
