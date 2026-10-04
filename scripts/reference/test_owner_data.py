"""Checks the owner's events and workouts files are read correctly, using
made-up files in a temporary folder (never the real private folder)."""

from __future__ import annotations

import csv
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import owner_data  # noqa: E402


class OwnerData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = owner_data.PRIVATE
        owner_data.PRIVATE = Path(self.tmp.name)

    def tearDown(self):
        owner_data.PRIVATE = self.saved
        self.tmp.cleanup()

    def test_events_ranges_become_days(self):
        (owner_data.PRIVATE / 'events.csv').write_text(
            'date,end_date,type,note\n2026-02-03,2026-02-05,illness,cold\n2026-03-14,,major_event,late night\n')
        rows = owner_data.read_events()
        self.assertEqual([r['date'] for r in rows], ['2026-02-03', '2026-02-04', '2026-02-05', '2026-03-14'])
        self.assertEqual(rows[-1], {'date': '2026-03-14', 'type': 'major_event', 'note': 'late night'})

    def test_unknown_event_type_is_refused(self):
        (owner_data.PRIVATE / 'events.csv').write_text('date,end_date,type,note\n2026-02-03,,flu,\n')
        with self.assertRaises(SystemExit):
            owner_data.read_events()

    def test_workouts_from_export(self):
        recent = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
        old = (datetime.now() - timedelta(days=500)).strftime('%Y-%m-%d')
        folder = owner_data.PRIVATE / 'apple_health_export'
        folder.mkdir()
        (folder / 'export.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
 <Record type="HKQuantityTypeIdentifierHeartRate" value="55" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:00:00 -0500"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="42.5" durationUnit="min"
          sourceName="Test Watch" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:42:30 -0500">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="151.26" minimum="90" maximum="170" unit="count/min"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeYoga" duration="1800" durationUnit="s"
          sourceName="Test Watch" startDate="{recent} 18:00:00 -0400" endDate="{recent} 18:30:00 -0400"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min"
          sourceName="Test Watch" startDate="{old} 07:00:00 -0500" endDate="{old} 07:30:00 -0500"/>
</HealthData>''')
        with redirect_stdout(io.StringIO()) as out:
            owner_data.workouts_from_export()
        self.assertIn('2 workouts', out.getvalue())
        with open(owner_data.PRIVATE / 'workouts.csv', newline='') as f:
            rows = list(csv.DictReader(f))
        self.assertEqual([(r['activity'], r['duration_min'], r['avg_hr'], r['tz_offset_min']) for r in rows],
                         [('running', '42.5', '151.3', '-300'), ('yoga', '30.0', '', '-240')])

    def test_impossible_and_copied_workouts_are_left_out(self):
        recent = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
        folder = owner_data.PRIVATE / 'apple_health_export'
        folder.mkdir()
        (folder / 'export.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40" durationUnit="min"
          sourceName="Test Watch" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:40:00 -0500"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40" durationUnit="min"
          sourceName="Some App" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:40:00 -0500"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="30" durationUnit="hr"
          sourceName="Test Watch" startDate="{recent} 09:00:00 -0500" endDate="{recent} 09:30:00 -0500"/>
</HealthData>''')
        with redirect_stdout(io.StringIO()) as out:
            owner_data.workouts_from_export()
        self.assertIn('1 workouts', out.getvalue())
        self.assertIn('2 left out', out.getvalue())

    def test_the_copy_with_heart_rate_is_kept(self):
        recent = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
        folder = owner_data.PRIVATE / 'apple_health_export'
        folder.mkdir()
        (folder / 'export.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40" durationUnit="min"
          sourceName="Some App" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:40:00 -0500"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40" durationUnit="min"
          sourceName="Test Watch" startDate="{recent} 07:00:00 -0500" endDate="{recent} 07:40:00 -0500">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="150" unit="count/min"/>
 </Workout>
</HealthData>''')
        with redirect_stdout(io.StringIO()):
            owner_data.workouts_from_export()
        with open(owner_data.PRIVATE / 'workouts.csv', newline='') as f:
            rows = list(csv.DictReader(f))
        self.assertEqual([(r['source_name'], r['avg_hr']) for r in rows], [('Test Watch', '150.0')])


if __name__ == '__main__':
    unittest.main()
