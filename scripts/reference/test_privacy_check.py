"""Checks the privacy check's own logic, without a database."""

from __future__ import annotations

import sys
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import privacy_check as pc  # noqa: E402


class PrivacyCheck(unittest.TestCase):
    def test_finds_every_table(self):
        tables = pc.tables_from_migrations()
        for t in ('profiles', 'samples', 'uploads', 'upload_tokens', 'daily_status', 'checkins', 'notifications',
                  'push_subscriptions', 'score_settings', 'digests'):
            self.assertIn(t, tables)
        self.assertEqual(len(tables), len(set(tables)))

    def test_a_refusal_is_recognised(self):
        self.assertTrue(pc.refused(401, {'code': '42501'}))
        self.assertTrue(pc.refused(403, {}))
        self.assertTrue(pc.refused(400, {'code': '42501', 'message': 'only the owner can see this'}))
        # A missing function or bad input is not a refusal: the check would
        # have tested nothing.
        self.assertFalse(pc.refused(404, {'code': 'PGRST202'}))
        self.assertFalse(pc.refused(400, {'code': '22023'}))
        self.assertFalse(pc.refused(200, []))

    def test_rows_count_as_a_leak(self):
        self.assertTrue(pc.no_rows(200, []))
        self.assertTrue(pc.no_rows(401, {'code': '42501'}))
        self.assertFalse(pc.no_rows(200, [{'user_id': 'someone else'}]))

    def test_functions_are_aimed_at_nobody(self):
        for name, args in pc.SERVER_ONLY:
            if 'p_user' in args:
                self.assertEqual(args['p_user'], pc.NOBODY, name)
        # The owner's loaders get input they'd refuse even if they ran.
        self.assertEqual(dict(pc.OWNER_ONLY)['replace_my_events'], {'p_events': 'not a list'})

    def test_refuses_the_owner_and_other_projects(self):
        owner = {'id': pc.NOBODY, 'app_metadata': {'is_owner': True}}
        with unittest.mock.patch.object(pc.api, 'live_env', return_value={
                'SUPABASE_URL': pc.LIVE_PROJECT, 'SUPABASE_PUBLISHABLE_KEY': 'k'}), \
                unittest.mock.patch('builtins.input', return_value='owner@example.test'), \
                unittest.mock.patch.object(pc.getpass, 'getpass', return_value='x' * 12), \
                unittest.mock.patch.object(pc, 'sign_in', return_value=({}, owner)), \
                unittest.mock.patch.object(pc, 'run_checks') as run:
            with self.assertRaises(SystemExit):
                pc.live()
            run.assert_not_called()
        with unittest.mock.patch.object(pc.api, 'live_env', return_value={
                'SUPABASE_URL': 'https://elsewhere.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'k'}):
            with self.assertRaises(SystemExit):
                pc.live()

    def test_prove_needs_the_local_copy(self):
        with self.assertRaises(SystemExit):
            pc.main(['--prove'])


if __name__ == '__main__':
    unittest.main()
