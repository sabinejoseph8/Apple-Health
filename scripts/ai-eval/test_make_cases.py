#!/usr/bin/env python3
"""Checks the AI development test set is well formed and its arithmetic agrees
with the score's rules (D59, D96). Run:  python3 -m unittest discover -s scripts/ai-eval
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import make_cases as mc  # noqa: E402

CASES = json.loads(mc.OUT.read_text())
ALLOWED_FLAGS = {'late_sync', 'no_sleep_stages', 'illness_pattern', 'sleep_floor'}


class CaseTests(unittest.TestCase):
    def test_forty_cases_with_unique_ids(self):
        self.assertEqual(len(CASES), 40)
        self.assertEqual(len({c['id'] for c in CASES}), 40)
        self.assertEqual(sum(c['kind'] == 'morning' for c in CASES), 28)

    def test_the_file_matches_the_script(self):
        # The committed file is exactly what the script makes today.
        self.assertEqual(json.dumps(mc.CASES, indent=1) + '\n', mc.OUT.read_text())

    def test_every_case_has_the_automated_and_always_judged_checks(self):
        for c in CASES:
            for check in mc.AUTOMATED + mc.ALWAYS_JUDGED:
                self.assertIn(check, c['expect'], c['id'])

    def test_morning_status_follows_the_zones_and_the_sleep_floor(self):
        for c in (c for c in CASES if c['kind'] == 'morning'):
            i = c['input']
            floor_hit = any(r['name'] == 'sleep' and r['spreads_worse'] >= mc.SLEEP_FLOOR for r in i['readings'])
            by_total = 'rest' if i['total'] >= mc.REST_AT else 'ease_off' if i['total'] >= mc.EASE_OFF_AT else 'ready'
            if by_total == 'ready' and floor_hit:
                self.assertEqual((i['status'], i['flags']['sleep_floor']), ('ease_off', True), c['id'])
            else:
                self.assertEqual((i['status'], i['flags']['sleep_floor']), (by_total, False), c['id'])

    def test_total_is_the_sum_of_points_and_flags_are_known(self):
        for c in (c for c in CASES if c['kind'] == 'morning'):
            i = c['input']
            self.assertAlmostEqual(i['total'], sum(r['points'] for r in i['readings']), delta=0.03, msg=c['id'])
            self.assertEqual(set(i['flags']), ALLOWED_FLAGS)
            self.assertEqual(i['readings_used'], len(i['readings']))

    def test_judged_checks_match_the_flags(self):
        for c in (c for c in CASES if c['kind'] == 'morning'):
            self.assertEqual('credits_sleep_floor' in c['expect'], c['input']['flags']['sleep_floor'], c['id'])
            self.assertEqual('says_two_of_three' in c['expect'], c['input']['readings_used'] == 2, c['id'])

    def test_thin_digests_must_not_claim_a_trend(self):
        for c in (c for c in CASES if c['kind'] == 'digest'):
            with_data = sum(d['status'] != 'none' for d in c['input']['days'])
            self.assertEqual('no_trend_from_thin_data' in c['expect'], with_data < 5 or not c['input']['prior_weeks'], c['id'])

    def test_no_real_text_or_dates_in_any_input(self):
        # Inputs hold only numbers and fixed words: no free text, no calendar date.
        text = json.dumps([c['input'] for c in CASES])
        self.assertIsNone(re.search(r'\d{4}-\d{2}-\d{2}', text))
        self.assertIsNone(re.search(r'@', text))


if __name__ == '__main__':
    unittest.main()
