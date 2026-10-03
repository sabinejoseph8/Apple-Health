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

    def test_repeat_item_is_only_used_inside_a_repeat(self):
        depth = 0
        for action in self.actions:
            params = action['WFWorkflowActionParameters']
            if action['WFWorkflowActionIdentifier'].endswith('repeat.each'):
                depth += 1 if params['WFControlFlowMode'] == 0 else -1
                continue
            uses = any(d.get('VariableName') == 'Repeat Item' for d in walk(params))
            self.assertFalse(uses and depth == 0)

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
        self.assertEqual(len(posts), 2)
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
            # A list of readings goes where the text says "[", a plain value elsewhere.
            filled = ''.join(
                ('{"type":"heart_rate"}' if i and text[i - 1] == '[' else 'x') if ch == OBJ else ch
                for i, ch in enumerate(text)
            )
            parsed = json.loads(filled)
            self.assertIsInstance(parsed, dict)
            checked += 1
        self.assertEqual(checked, 2 + len(bs.HEALTH_TYPES), 'ping, daily post and one line per reading type')

    def test_each_reading_type_is_read_once_with_its_clarivi_name(self):
        finds = [a for a in self.actions if a['WFWorkflowActionIdentifier'].endswith('filter.health.quantity')]
        labels = [f['WFWorkflowActionParameters']['WFContentItemFilter']['Value']['WFActionParameterFilterTemplates'][0]
                  ['Values']['Enumeration']['Value'] for f in finds]
        self.assertEqual(labels, [label for label, _, _ in bs.HEALTH_TYPES])
        lines = [text_of(a) for a in self.actions if (text_of(a) or '').startswith('{"type"')]
        for (_, clarivi_type, _), line in zip(bs.HEALTH_TYPES, lines):
            self.assertTrue(line.startswith('{"type":"' + clarivi_type + '"'), line)


if __name__ == '__main__':
    unittest.main()
