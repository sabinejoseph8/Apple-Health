#!/usr/bin/env python3
"""Checks the Clarivi Sync Shortcut is well formed before it reaches a phone.

Run:  python3 scripts/shortcut/test_build_shortcut.py
"""

import json
import plistlib
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_check_shortcut as check  # noqa: E402
import build_shortcut as bs  # noqa: E402

OBJ = bs.OBJ


def walk(value):
    """Every dict nested anywhere inside value."""
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)


def text_of(action):
    t = action['WFWorkflowActionParameters'].get('WFTextActionText')
    if isinstance(t, str):
        return t
    if isinstance(t, dict):
        return t['Value']['string']
    return None


class ShortcutTests(unittest.TestCase):
    def setUp(self):
        self.wf = bs.build()
        self.actions = self.wf['WFWorkflowActions']

    def test_it_round_trips_as_a_binary_plist(self):
        self.assertEqual(plistlib.loads(plistlib.dumps(self.wf, fmt=plistlib.FMT_BINARY)), self.wf)

    def test_every_variable_sits_where_its_range_says(self):
        for d in walk(self.wf):
            if 'attachmentsByRange' in d:
                text = d['string']
                self.assertEqual(text.count(OBJ), len(d['attachmentsByRange']), text)
                for key in d['attachmentsByRange']:
                    position = int(re.match(r'\{(\d+), 1\}', key).group(1))
                    self.assertEqual(text[position], OBJ, f'{key} in {text!r}')

    def test_every_output_used_comes_from_an_earlier_action(self):
        seen = set()
        for action in self.actions:
            params = action['WFWorkflowActionParameters']
            for d in walk(params):
                if d.get('Type') == 'ActionOutput':
                    self.assertIn(d['OutputUUID'], seen, action['WFWorkflowActionIdentifier'])
            if 'UUID' in params:
                seen.add(params['UUID'])

    def test_every_named_variable_is_set_before_it_is_used(self):
        named = {'Repeat Item'}
        for action in self.actions:
            params = action['WFWorkflowActionParameters']
            for d in walk(params):
                if d.get('Type') == 'Variable' and 'VariableName' in d:
                    self.assertIn(d['VariableName'], named, action['WFWorkflowActionIdentifier'])
            if action['WFWorkflowActionIdentifier'].endswith(('setvariable', 'appendvariable')):
                named.add(params['WFVariableName'])

    def test_if_and_repeat_blocks_open_and_close_in_order(self):
        stack = []
        for action in self.actions:
            params = action['WFWorkflowActionParameters']
            if 'GroupingIdentifier' not in params:
                continue
            mode, group = params['WFControlFlowMode'], params['GroupingIdentifier']
            if mode == 0:
                stack.append(group)
            else:
                self.assertTrue(stack and stack[-1] == group, 'a block closes out of order')
                if mode == 2:
                    stack.pop()
        self.assertEqual(stack, [])

    def test_there_is_no_loop_per_reading(self):
        # One loop pass per reading took over 14 minutes for a day of heart
        # rate on an iPhone (Phase 1b spike), so readings go as columns. The
        # only loop is the import's, once per month.
        each = [a for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('repeat.each')]
        self.assertEqual(each, [])
        counts = [a['WFWorkflowActionParameters'] for a in self.actions
                  if a['WFWorkflowActionIdentifier'].endswith('repeat.count')
                  and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 0]
        self.assertEqual([c['WFRepeatCount'] for c in counts], [bs.IMPORT_MONTHS, bs.MAX_DAYS_IN_MONTH])

    def test_the_token_is_asked_for_at_install_and_nothing_secret_is_built_in(self):
        [question] = self.wf['WFWorkflowImportQuestions']
        target = self.actions[question['ActionIndex']]
        self.assertEqual(target['WFWorkflowActionIdentifier'], 'is.workflow.actions.gettext')
        self.assertEqual(text_of(target), bs.TOKEN_PLACEHOLDER)
        flat = json.dumps(self.wf, default=str)
        self.assertNotRegex(flat, r'clv_[A-Za-z0-9_-]{43}')

    def test_posts_go_to_the_ingest_function_with_the_token(self):
        posts = [a['WFWorkflowActionParameters'] for a in self.actions
                 if a['WFWorkflowActionIdentifier'].endswith('downloadurl')]
        self.assertEqual(len(posts), 4, 'ping, daily post, and the import\'s small-readings and heart rate part posts')
        for p in posts:
            self.assertEqual(p['WFURL']['Value']['string'], bs.INGEST_URL)
            self.assertEqual(p['WFHTTPMethod'], 'POST')
            headers = p['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']
            auth = next(h for h in headers if h['WFKey']['Value']['string'] == 'Authorization')
            self.assertEqual(auth['WFValue']['Value']['string'], 'Bearer ' + OBJ)

    def test_every_json_text_is_valid_once_its_variables_are_filled_in(self):
        checked = 0
        for action in self.actions:
            text = text_of(action)
            if not text or not text.startswith('{'):
                continue
            # A reading type's columns go inside the series list ("[" or "," before
            # the variable); the import's gathered heart rate days follow another
            # series and may be empty; anywhere else a variable is plain text in
            # quotes.
            def fill(i):
                before = text[i - 1] if i else ''
                if before in '[,':
                    return '{}'
                if before in (OBJ, '}'):
                    return ''
                return 'true' if before == ':' else 'x'
            filled = ''.join(fill(i) if ch == OBJ else ch for i, ch in enumerate(text))
            parsed = json.loads(filled)
            self.assertIsInstance(parsed, dict)
            checked += 1
        n = len(bs.HEALTH_TYPES)
        self.assertEqual(checked, 4 + n + (n - 1) + 2,
                         'ping, daily and two import posts; the sync\'s series; '
                         'the import\'s monthly series; two heart rate day series')

    def test_each_reading_type_is_read_once_with_its_clarivi_name(self):
        finds = [a for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('filter.health.quantity')]
        labels = [f['WFWorkflowActionParameters']['WFContentItemFilter']['Value']['WFActionParameterFilterTemplates'][0]
                  ['Values']['Enumeration']['Value'] for f in finds]
        monthly = [(label, t) for label, t in bs.HEALTH_TYPES if t != 'heart_rate']
        expected = monthly + [('Heart Rate', 'heart_rate')] * 2 + list(bs.HEALTH_TYPES)
        self.assertEqual(labels, [label for label, _ in expected], 'import (monthly types, heart rate by day), then the sync')
        lines = [text_of(a) for a in self.actions if (text_of(a) or '').startswith('{"type"')]
        self.assertEqual(len(lines), len(expected))
        import_heart_rate = {len(monthly), len(monthly) + 1}
        for i, ((_, clarivi_type), line) in enumerate(zip(expected, lines)):
            self.assertTrue(line.startswith('{"type":"' + clarivi_type + '"'), line)
            columns = bs.LEAN_COLUMNS if i in import_heart_rate else bs.COLUMNS
            self.assertEqual(re.findall(r'"(\w+)":\["', line), [key for key, _ in columns])

    def test_health_searches_use_whole_days(self):
        # Finer date filters don't work on Health samples (Phase 1b spike):
        # the sync asks for yesterday and today, the import for whole months.
        finds = [a for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('filter.health.quantity')]
        rows = [f['WFWorkflowActionParameters']['WFContentItemFilter']['Value']['WFActionParameterFilterTemplates'][1]
                for f in finds]
        n = len(bs.HEALTH_TYPES)
        import_rows, sync_rows = rows[:n + 1], rows[n + 1:]
        for row in import_rows:
            self.assertEqual((row['Property'], row['Operator'], set(row['Values'])), ('Start Date', 1003, {'Date', 'AnotherDate'}))
        self.assertEqual([r['Values']['Date']['Value']['VariableName'] for r in import_rows], ['Month'] * (n - 1) + ['Day', 'Day'])
        for row in sync_rows:
            self.assertEqual((row['Property'], row['Operator'], row['Values']), ('Start Date', 1001, {'Number': '1', 'Unit': 16}))

    def test_the_import_sends_each_month_as_a_backfill_and_remembers_it(self):
        bodies = [text_of(a) for a in self.actions if (text_of(a) or '').startswith('{"schema_version"')]
        backfill = [t for t in bodies if '"kind":"backfill"' in t]
        self.assertEqual(len(backfill), 2, 'the small readings, and a part of heart rate')
        for body in backfill:
            self.assertIn('"month_id":"' + OBJ + '"', body)
        self.assertNotIn(bs.EMPTY_HEART_RATE, backfill[0], 'the small readings go on their own')
        self.assertIn(bs.EMPTY_HEART_RATE, backfill[1])
        files = [a['WFWorkflowActionParameters'] for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('setitemname')]
        self.assertIn(bs.IMPORT_FILE, [f['WFName'] for f in files])
        opened = [a['WFWorkflowActionParameters']['WFGetFilePath'] for a in self.actions
                  if a['WFWorkflowActionIdentifier'].endswith('documentpicker.open')]
        self.assertEqual(sorted(opened), sorted(['Clarivi/' + bs.IMPORT_FILE, 'Clarivi/' + bs.MARKER_FILE]))
        skips = [a['WFWorkflowActionParameters'] for a in self.actions
                 if a['WFWorkflowActionIdentifier'].endswith('conditional') and a['WFWorkflowActionParameters'].get('WFCondition') == 999
                 and isinstance(a['WFWorkflowActionParameters'].get('WFConditionalActionString'), dict)]
        self.assertEqual(len(skips), 1, 'months already in import-done.txt are skipped')
        self.assertIn(',"month_complete":' + OBJ + ',', backfill[1], 'the heart rate part says whether it ends the month')

    def test_nothing_is_sent_just_after_the_day_loop(self):
        # A post made just after the day-by-day loop failed every time on
        # Sabine's iPhone (1c), so the month's last part goes inside the loop.
        actions = self.actions
        ends = [i for i, a in enumerate(actions) if a['WFWorkflowActionIdentifier'].endswith('repeat.count')
                and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 2]
        day_loop_end = ends[0]
        month_loop_end = ends[1]
        between = [a['WFWorkflowActionIdentifier'] for a in actions[day_loop_end + 1:month_loop_end]]
        self.assertNotIn('is.workflow.actions.downloadurl', between)
        conditions = [a['WFWorkflowActionParameters'] for a in actions[:day_loop_end]
                      if a['WFWorkflowActionIdentifier'].endswith('conditional') and a['WFWorkflowActionParameters'].get('WFCondition') == 5
                      and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 0]
        self.assertTrue(any('yyyy-MM' in json.dumps(c) for c in conditions), 'a part is sent on the month\'s last day')
    def test_every_post_counts_only_if_clarivi_says_what_it_accepted(self):
        # Review fix: a gateway error page has no "error" key, so success is
        # checked, not failure.
        acts = self.actions
        for i, a in enumerate(acts):
            if not a['WFWorkflowActionIdentifier'].endswith('downloadurl'):
                continue
            check = acts[i + 1]['WFWorkflowActionParameters']
            self.assertEqual((check.get('WFCondition'), check.get('WFConditionalActionString')), (999, '"accepted":'))
            self.assertEqual(check['WFInput']['Variable']['Value']['OutputUUID'], a['WFWorkflowActionParameters']['UUID'])

    def test_device_names_cannot_break_the_json(self):
        replaces = [a['WFWorkflowActionParameters'] for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('text.replace')]
        combines_of_source = [a for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('text.combine')
                              and any(g.get('PropertyName') == 'Source' for g in a['WFWorkflowActionParameters']['text']['Value'].get('Aggrandizements', []))]
        self.assertEqual(len(replaces), len(combines_of_source))
        for r in replaces:
            self.assertEqual((r['WFReplaceTextFind'], r['WFReplaceTextReplace'], r['WFReplaceTextRegularExpression']),
                             (bs.SOURCE_UNSAFE, "'", True))
        self.assertEqual(re.sub(bs.SOURCE_UNSAFE, "'", 'Sam"s \\Ultra'), "Sam's 'Ultra")

    def test_notification_titles_come_from_the_wording_module(self):
        titles = {a['WFWorkflowActionParameters']['WFNotificationActionTitle']['Value']['string'] for a in self.actions
                  if a['WFWorkflowActionIdentifier'].endswith('notification')}
        self.assertEqual(titles, {bs.shortcut_wording()['appName']})

    def test_dates_only_move_in_hours(self):
        # Adjust Date ignored a step in months on Sabine's iPhone (1c), while
        # steps in hours worked (1b), so every date step is in hours.
        units = [a['WFWorkflowActionParameters']['WFDuration']['Value']['Unit'] for a in self.actions
                 if a['WFWorkflowActionIdentifier'].endswith('adjustdate')]
        self.assertTrue(units)
        self.assertEqual(set(units), {'hr'})

    def test_month_steps_always_land_in_the_right_month(self):
        # From noon on the 1st of any month, the forward step lands in the next
        # month and the backward step in the previous one (DST moves noon by an
        # hour at most, which can't change the day).
        import datetime
        for year in (2025, 2026, 2028):
            for month in range(1, 13):
                first = datetime.datetime(year, month, 1, 12)
                later = first + datetime.timedelta(hours=bs.HOURS_TO_NEXT_MONTH)
                earlier = first - datetime.timedelta(hours=bs.HOURS_TO_PREVIOUS_MONTH)
                self.assertEqual((later.year * 12 + later.month) - (year * 12 + month), 1)
                self.assertEqual((year * 12 + month) - (earlier.year * 12 + earlier.month), 1)

    def test_import_heart_rate_is_read_a_day_at_a_time_with_a_cap(self):
        finds = [a['WFWorkflowActionParameters'] for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('filter.health.quantity')]
        day_finds = [f for f in finds if f['WFContentItemLimitEnabled']]
        self.assertEqual([(f['WFContentItemSortOrder'], f['WFContentItemLimitNumber']) for f in day_finds],
                         [('Oldest First', bs.DAY_LIMIT), ('Latest First', bs.DAY_LIMIT)])
        at_least = [a['WFWorkflowActionParameters'] for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('conditional')
                    and a['WFWorkflowActionParameters'].get('WFCondition') == 3]
        self.assertEqual([h['WFNumberValue'] for h in at_least], [str(bs.DAY_LIMIT), str(bs.PART_CHARACTERS)],
                         'a second search only on a heavy day; a part sent once the days reach the part size')

    def test_the_menu_words_come_from_the_wording_module(self):
        words = bs.shortcut_wording()
        self.assertEqual(set(words), {'menuPrompt', 'syncNow', 'importHistory', 'importFinished', 'appName', 'failed'})
        [menu] = [a['WFWorkflowActionParameters'] for a in self.actions
                  if a['WFWorkflowActionIdentifier'].endswith('choosefrommenu') and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 0]
        self.assertEqual(menu['WFMenuPrompt'], words['menuPrompt'])
        self.assertEqual(menu['WFMenuItems'], [words['syncNow'], words['importHistory']])
        for text in words.values():
            self.assertNotIn('\u2014', text)

    def test_each_column_is_joined_as_a_json_list_of_text(self):
        combines = [a['WFWorkflowActionParameters'] for a in self.actions
                    if a['WFWorkflowActionIdentifier'].endswith('text.combine')]
        n = len(bs.HEALTH_TYPES)
        self.assertEqual(len(combines), (2 * n - 1) * len(bs.COLUMNS) + 2 * len(bs.LEAN_COLUMNS))
        for c in combines:
            self.assertEqual((c['WFTextSeparator'], c['WFTextCustomSeparator']), ('Custom', '","'))
            details = [a['PropertyName'] for a in c['text']['Value'].get('Aggrandizements', []) if 'PropertyName' in a]
            self.assertEqual(len(details), 1)


class CheckShortcutTests(unittest.TestCase):
    """The diagnostic Shortcut: well formed, sends nothing, asks for nothing."""

    def test_it_is_well_formed_and_never_connects(self):
        wf = check.build()
        seen = set()
        for action in wf['WFWorkflowActions']:
            params = action['WFWorkflowActionParameters']
            self.assertNotIn('downloadurl', action['WFWorkflowActionIdentifier'])
            for d in walk(params):
                if d.get('Type') == 'ActionOutput':
                    self.assertIn(d['OutputUUID'], seen)
                if 'attachmentsByRange' in d:
                    self.assertEqual(d['string'].count(OBJ), len(d['attachmentsByRange']))
            if 'UUID' in params:
                seen.add(params['UUID'])
        self.assertEqual(wf['WFWorkflowImportQuestions'], [])


if __name__ == '__main__':
    unittest.main()
