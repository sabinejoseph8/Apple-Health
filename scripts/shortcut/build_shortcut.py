#!/usr/bin/env python3
"""Builds the "Clarivi Sync" iPhone Shortcut (docs/tech-spec.md, section 4).

Run:  python3 scripts/shortcut/build_shortcut.py
Writes private/shortcut/Clarivi Sync (unsigned).shortcut, then signs it with
Apple's own `shortcuts sign` tool into private/shortcut/Clarivi Sync.shortcut.

The template is blank: it asks for the upload token when it's installed, so a
configured Shortcut is never shared (tech-spec section 6). The signed file
carries the signer's Apple account details, so it stays in private/ (never
committed); only this script is in the repository.

What the Shortcut does, each run:
1. Works out which automation ran it from its input ("charger" or "app"), or
   "manual" when run by hand. Automations only act between 4am and noon.
2. Stops if iCloud Drive/Shortcuts/Clarivi/last-sync.txt already holds
   today's date (the second "already synced" check).
3. Sends a ping. Stops if the reply says today is already complete, or shows
   the reply's message if Clarivi refused it.
4. Reads yesterday's and today's readings (heart rate, HRV, breathing rate,
   resting heart rate and sleep stages) and posts them as one daily post,
   one list per column. Health searches in Shortcuts only work in whole days,
   so the server keeps heart rate from 6pm to noon (D18). Building one line
   per reading took over 14 minutes for a day of heart rate on an iPhone;
   columns take about a second (Phase 1b spike, 3 October 2026).
5. Saves today's date to last-sync.txt once the night is complete, and shows
   Clarivi's message when run by hand.

Run by hand, it first asks: sync this morning, or import the last 12 months
(R12). The import sends this month and the 11 before it, newest first (so an
interrupted import already has the recent months a baseline needs), one post
per month ("backfill" with its month_id), using whole-month searches.
Month steps use hours only: Adjust Date ignored a step of whole months on
Sabine's iPhone (1c, 3 October 2026), so the Shortcut moves 40 days on or 15
days back in hours and snaps to the 1st of that month.
After each month it adds the month to Clarivi/import-done.txt and shows
Clarivi's progress message; months already in that file are skipped, so an
interrupted import carries on where it stopped. Progress is kept on the phone
so the upload token stays write-only (decided 3 October 2026).

Every word the Shortcut shows itself (the menu, the "finished" line) comes
from the shortcut section of supabase/functions/_shared/wording.ts.

The Shortcut tests the reply's JSON text for "already_complete_today":true,
"night_complete":true and "error", which the ingest function's tests pin
down (supabase/functions/ingest/handler.test.ts).
"""

import json
import plistlib
import re
import subprocess
import sys
import uuid
from pathlib import Path

INGEST_URL = 'https://vuynnnrijdbvamwfauog.supabase.co/functions/v1/ingest'
TOKEN_PLACEHOLDER = 'Paste your upload token here'
MARKER_FOLDER = 'Clarivi/'
MARKER_FILE = 'last-sync.txt'
IMPORT_FILE = 'import-done.txt'
IMPORT_MONTHS = 12
WORDING = Path(__file__).resolve().parents[2] / 'supabase' / 'functions' / '_shared' / 'wording.ts'
OBJ = '￼'  # where a variable sits inside a text field

# Health types: Find Health Samples picker label, Clarivi type.
HEALTH_TYPES = [
    ('Heart Rate', 'heart_rate'),
    ('Heart Rate Variability', 'hrv_sdnn'),
    ('Respiratory Rate', 'respiratory_rate'),
    ('Resting Heart Rate', 'resting_hr'),
    ('Sleep', 'sleep_stage'),
]

# Columns sent for each type, and the Health sample detail each comes from.
COLUMNS = [('start', 'Start Date'), ('end', 'End Date'), ('value', 'Value'), ('unit', 'Unit'), ('source', 'Source')]

# Joins a column's entries into the inside of a JSON list of text: a","b","c.
COLUMN_SEPARATOR = '","'

# "Start Date is in the last 1 day": yesterday and today. Finer date filters
# (after a time, between two times, in the last N hours) don't work on Health
# samples in Shortcuts (Phase 1b spike, 3 October 2026).
LAST_DAY = {'Operator': 1001, 'Values': {'Number': '1', 'Unit': 16}}


def shortcut_wording():
    """The plain strings in wording.ts's shortcut section."""
    source = WORDING.read_text()
    block = re.search(r'\n  shortcut: \{\n(.*?)\n  \},', source, re.S)
    if not block:
        raise SystemExit('wording.ts has no shortcut section')
    return dict(re.findall(r"^\s+(\w+): '([^'\\]*)',$", block.group(1), re.M))

ISO_TIME = "yyyy-MM-dd'T'HH:mm:ssXXXXX"


def new_id():
    return str(uuid.uuid4()).upper()


# References to values: an action's output, a named variable, the current
# date or the Shortcut's input. Each can carry aggrandizements (a property,
# a date format or a type coercion).
def output(action_id, name, *aggr):
    ref = {'Type': 'ActionOutput', 'OutputUUID': action_id, 'OutputName': name}
    if aggr:
        ref['Aggrandizements'] = list(aggr)
    return ref


def variable(name, *aggr):
    ref = {'Type': 'Variable', 'VariableName': name}
    if aggr:
        ref['Aggrandizements'] = list(aggr)
    return ref


def current_date(*aggr):
    ref = {'Type': 'CurrentDate'}
    if aggr:
        ref['Aggrandizements'] = list(aggr)
    return ref


def shortcut_input():
    return {'Type': 'ExtensionInput'}


def date_format(pattern):
    return {'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'Custom',
            'WFDateFormat': pattern, 'WFISO8601IncludeTime': False}


def prop(name):
    return {'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': name}


def as_text():
    return {'Type': 'WFCoercionVariableAggrandizement', 'CoercionItemClass': 'WFStringContentItem'}


def attachment(ref):
    return {'Value': ref, 'WFSerializationType': 'WFTextTokenAttachment'}


def tokens(*parts):
    """Text with variables: plain strings and references, in order."""
    text = ''
    ranges = {}
    for part in parts:
        if isinstance(part, str):
            text += part
        else:
            ranges[f'{{{len(text)}, 1}}'] = part
            text += OBJ
    return {'Value': {'string': text, 'attachmentsByRange': ranges}, 'WFSerializationType': 'WFTextTokenString'}


class Out:
    """An action's output, usable as a reference."""

    def __init__(self, action_id, name):
        self.id = action_id
        self.name = name

    def ref(self, *aggr):
        return output(self.id, self.name, *aggr)


class Builder:
    def __init__(self):
        self.actions = []
        self.questions = []

    def add(self, identifier, params):
        self.actions.append({'WFWorkflowActionIdentifier': f'is.workflow.actions.{identifier}',
                             'WFWorkflowActionParameters': params})
        return len(self.actions) - 1

    def comment(self, text):
        self.add('comment', {'WFCommentActionText': text})

    def text(self, *parts):
        action_id = new_id()
        value = parts[0] if len(parts) == 1 and isinstance(parts[0], str) else tokens(*parts)
        self.add('gettext', {'UUID': action_id, 'WFTextActionText': value})
        return Out(action_id, 'Text')

    def set_variable(self, name, out):
        self.add('setvariable', {'WFVariableName': name, 'WFInput': attachment(out.ref())})

    def number(self, out):
        action_id = new_id()
        self.add('number', {'UUID': action_id, 'WFNumberActionNumber': attachment(out.ref())})
        return Out(action_id, 'Number')

    def if_(self, ref, condition, string=None, number=None):
        group = new_id()
        params = {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFCondition': condition,
                  'WFInput': {'Type': 'Variable', 'Variable': attachment(ref)}}
        if string is not None:
            params['WFConditionalActionString'] = string
        if number is not None:
            params['WFNumberValue'] = str(number)
        self.add('conditional', params)
        return group

    def otherwise(self, group):
        self.add('conditional', {'GroupingIdentifier': group, 'WFControlFlowMode': 1})

    def end_if(self, group):
        self.add('conditional', {'UUID': new_id(), 'GroupingIdentifier': group, 'WFControlFlowMode': 2})

    def stop(self):
        self.add('exit', {})

    def notify(self, *parts):
        self.add('notification', {'UUID': new_id(), 'WFNotificationActionTitle': tokens('Clarivi'),
                                  'WFNotificationActionBody': tokens(*parts), 'WFNotificationActionSound': False})

    def date_from(self, *parts):
        action_id = new_id()
        self.add('date', {'UUID': action_id, 'WFDateActionMode': 'Specified Date', 'WFDateActionDate': tokens(*parts)})
        return Out(action_id, 'Date')

    def adjust(self, date_ref, operation, magnitude, unit):
        """Add or Subtract a fixed amount. The source date goes in as text with
        a variable, the only form that worked in the 1b spike."""
        action_id = new_id()
        self.add('adjustdate', {
            'UUID': action_id,
            'WFDate': tokens(date_ref),
            'WFAdjustOperation': operation,
            'WFDuration': {'Value': {'Magnitude': str(magnitude), 'Unit': unit}, 'WFSerializationType': 'WFQuantityFieldValue'},
        })
        return Out(action_id, 'Adjusted Date')

    def menu(self, prompt, items):
        group = new_id()
        self.add('choosefrommenu', {'GroupingIdentifier': group, 'WFControlFlowMode': 0,
                                    'WFMenuPrompt': prompt, 'WFMenuItems': list(items)})
        return group

    def menu_case(self, group, title):
        self.add('choosefrommenu', {'GroupingIdentifier': group, 'WFControlFlowMode': 1, 'WFMenuItemTitle': title})

    def end_menu(self, group):
        self.add('choosefrommenu', {'UUID': new_id(), 'GroupingIdentifier': group, 'WFControlFlowMode': 2})

    def repeat_count(self, count):
        group = new_id()
        self.add('repeat.count', {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFRepeatCount': count})
        return group

    def end_repeat(self, group):
        self.add('repeat.count', {'UUID': new_id(), 'GroupingIdentifier': group, 'WFControlFlowMode': 2})

    def find_health(self, label, date_row=LAST_DAY):
        action_id = new_id()
        self.add('filter.health.quantity', {
            'UUID': action_id,
            'WFContentItemFilter': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFContentPredicateBoundedDate': False,
                    'WFActionParameterFilterTemplates': [
                        {'Bounded': True, 'Operator': 4, 'Property': 'Type', 'Removable': False,
                         'Values': {'Enumeration': {'Value': label, 'WFSerializationType': 'WFStringSubstitutableState'}}},
                        dict({'Bounded': True, 'Property': 'Start Date', 'Removable': True}, **date_row),
                    ],
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            },
            'WFContentItemSortProperty': 'Start Date',
            'WFContentItemSortOrder': 'Oldest First',
            'WFContentItemLimitEnabled': False,
        })
        return Out(action_id, 'Health Samples')

    def combine(self, ref, separator):
        action_id = new_id()
        self.add('text.combine', {'UUID': action_id, 'Show-text': True, 'WFTextSeparator': 'Custom',
                                  'WFTextCustomSeparator': separator, 'text': attachment(ref)})
        return Out(action_id, 'Combined Text')

    def post(self, body, url):
        action_id = new_id()

        def header(key, *value):
            return {'WFItemType': 0, 'WFKey': tokens(key), 'WFValue': tokens(*value)}

        self.add('downloadurl', {
            'UUID': action_id,
            'WFURL': tokens(url),
            'WFHTTPMethod': 'POST',
            'WFHTTPBodyType': 'File',
            'WFRequestVariable': attachment(body.ref()),
            'WFFormValues': {'Value': {'WFDictionaryFieldValueItems': []}, 'WFSerializationType': 'WFDictionaryFieldValue'},
            'WFHTTPHeaders': {'Value': {'WFDictionaryFieldValueItems': [
                header('Authorization', 'Bearer ', variable('Token')),
                header('Content-Type', 'application/json'),
            ]}, 'WFSerializationType': 'WFDictionaryFieldValue'},
            'Advanced': True,
            'ShowHeaders': True,
        })
        return Out(action_id, 'Contents of URL')

    def dictionary_value(self, out, key):
        action_id = new_id()
        self.add('getvalueforkey', {'UUID': action_id, 'WFGetDictionaryValueType': 'Value',
                                    'WFDictionaryKey': key, 'WFInput': attachment(out.ref())})
        return Out(action_id, 'Dictionary Value')

    def get_file(self, name):
        action_id = new_id()
        self.add('documentpicker.open', {'UUID': action_id, 'WFGetFilePath': MARKER_FOLDER + name,
                                         'WFFileErrorIfNotFound': False, 'WFShowFilePicker': False})
        return Out(action_id, 'File')

    def save_file(self, name, ref):
        """Saves text to iCloud Drive/Shortcuts/Clarivi/<name>, replacing it."""
        text = self.text(ref)
        named_id = new_id()
        self.add('setitemname', {'UUID': named_id, 'WFInput': attachment(text.ref()), 'WFName': name})
        self.add('documentpicker.save', {'UUID': new_id(), 'WFInput': attachment(output(named_id, 'Renamed Item')),
                                         'WFAskWhereToSave': False, 'WFFileDestinationPath': MARKER_FOLDER,
                                         'WFSaveFileOverwrite': True})

    def get_marker(self):
        return self.get_file(MARKER_FILE)

    def save_marker(self):
        self.save_file(MARKER_FILE, variable('Today'))

    def stop_if_refused(self, reply):
        group = self.if_(reply.ref(as_text()), 99, string='"error"')
        message = self.dictionary_value(reply, 'message')
        self.notify(message.ref())
        self.stop()
        self.end_if(group)


def series_text(b, clarivi_type, samples):
    """One reading type as columns: {"type":..,"start":[..],"end":[..],...}."""
    parts = ['{"type":"' + clarivi_type + '"']
    for key, detail in COLUMNS:
        aggr = [prop(detail)] + ([date_format(ISO_TIME)] if detail.endswith('Date') else [])
        column = b.combine(samples.ref(*aggr), COLUMN_SEPARATOR)
        parts += [',"' + key + '":["', column.ref(), '"]']
    parts.append('}')
    return b.text(*parts)


# Moving between months in hours: from noon on the 1st, 40 days on is always
# inside the next month and 15 days back inside the one before.
HOURS_TO_NEXT_MONTH = 40 * 24
HOURS_TO_PREVIOUS_MONTH = 15 * 24


def import_history(b, url, words):
    """The one-year import: this month and the 11 before it, one post each."""
    b.comment('Import the last 12 months, newest first, one month per post. Months already listed in '
              'Clarivi/import-done.txt are skipped, so an interrupted import carries on where it stopped.')
    # "yyyy-MM-01" becomes noon on the 1st, which is fine: Health searches
    # only work in whole days.
    b.set_variable('Month', b.date_from(current_date(date_format('yyyy-MM-01'))))
    b.set_variable('Done', b.text(b.get_file(IMPORT_FILE).ref(as_text())))
    loop = b.repeat_count(IMPORT_MONTHS)
    month_id = b.text(variable('Month', date_format('yyyy-MM')))
    later = b.adjust(variable('Month'), 'Add', HOURS_TO_NEXT_MONTH, 'hr')
    next_month = b.date_from(later.ref(date_format('yyyy-MM-01')))
    to_do = b.if_(variable('Done'), 999, string=tokens(month_id.ref()))
    whole_month = {'Operator': 1003, 'Values': {'Date': attachment(variable('Month')),
                                                'AnotherDate': attachment(next_month.ref())}}
    series = [series_text(b, clarivi_type, b.find_health(label, whole_month)) for label, clarivi_type in HEALTH_TYPES]
    joined = []
    for i, text in enumerate(series):
        joined += ([','] if i else []) + [text.ref()]
    body = b.text('{"schema_version":1,"kind":"backfill","month_id":"', month_id.ref(), '","device_tz_offset_min":"',
                  variable('Offset'), '","trigger":"manual","series":[', *joined, ']}')
    reply = b.post(body, url)
    b.stop_if_refused(reply)
    b.set_variable('Done', b.text(variable('Done'), ' ', month_id.ref()))
    b.save_file(IMPORT_FILE, variable('Done'))
    b.notify(b.dictionary_value(reply, 'message').ref())
    b.end_if(to_do)
    earlier = b.adjust(variable('Month'), 'Subtract', HOURS_TO_PREVIOUS_MONTH, 'hr')
    b.set_variable('Month', b.date_from(earlier.ref(date_format('yyyy-MM-01'))))
    b.end_repeat(loop)
    b.notify(words['importFinished'])
    b.stop()


def build(url=INGEST_URL):
    words = shortcut_wording()
    b = Builder()
    b.comment('Clarivi Sync sends last night\'s Apple Watch readings to Clarivi. It runs from two automations '
              '(charger unplugged, and an app you open each morning) and can be run by hand.')

    token = b.text(TOKEN_PLACEHOLDER)
    b.questions.append({'ActionIndex': len(b.actions) - 1, 'Category': 'Parameter', 'DefaultValue': '',
                        'ParameterKey': 'WFTextActionText',
                        'Text': 'Paste your upload token from Clarivi (Upload token, then Create token).'})
    b.set_variable('Token', token)

    b.comment('Which automation ran this: "charger" or "app", passed in as input. Run by hand, it is "manual".')
    group = b.if_(shortcut_input(), 100)
    b.set_variable('Trigger', b.text(shortcut_input()))
    b.otherwise(group)
    b.set_variable('Trigger', b.text('manual'))
    b.end_if(group)

    b.set_variable('Today', b.text(current_date(date_format('yyyy-MM-dd'))))
    b.set_variable('Offset', b.text(current_date(date_format('XXXXX'))))

    b.comment('Run by hand, choose between this morning\'s sync and the one-year import.')
    b.set_variable('Mode', b.text('sync'))
    by_hand = b.if_(variable('Trigger'), 4, string='manual')
    menu = b.menu(words['menuPrompt'], [words['syncNow'], words['importHistory']])
    b.menu_case(menu, words['syncNow'])
    b.menu_case(menu, words['importHistory'])
    b.set_variable('Mode', b.text('import'))
    b.end_menu(menu)
    b.end_if(by_hand)
    importing = b.if_(variable('Mode'), 4, string='import')
    import_history(b, url, words)
    b.end_if(importing)

    b.comment('Automations only act between 4am and noon.')
    hour = b.number(b.text(current_date(date_format('H'))))
    automatic = b.if_(variable('Trigger'), 5, string='manual')
    early = b.if_(hour.ref(), 0, number=4)
    b.stop()
    b.end_if(early)
    late = b.if_(hour.ref(), 2, number=11)
    b.stop()
    b.end_if(late)
    b.end_if(automatic)

    b.comment('Stop if this phone already finished today\'s sync.')
    marker = b.get_marker()
    done = b.if_(marker.ref(as_text()), 4, string=tokens(variable('Today')))
    b.stop()
    b.end_if(done)

    b.comment('Ask Clarivi whether today\'s sync is already done.')
    ping_body = b.text('{"schema_version":1,"kind":"ping","device_tz_offset_min":"', variable('Offset'),
                       '","trigger":"', variable('Trigger'), '"}')
    ping = b.post(ping_body, url)
    b.stop_if_refused(ping)
    already = b.if_(ping.ref(as_text()), 99, string='"already_complete_today":true')
    b.save_marker()
    b.stop()
    b.end_if(already)

    b.comment('Read yesterday\'s and today\'s readings, one list per column. Clarivi keeps heart rate '
              'from 6pm to noon.')
    series = []
    for label, clarivi_type in HEALTH_TYPES:
        series.append(series_text(b, clarivi_type, b.find_health(label)))

    b.comment('Send the readings.')
    joined = []
    for i, text in enumerate(series):
        joined += ([','] if i else []) + [text.ref()]
    body = b.text('{"schema_version":1,"kind":"daily","device_tz_offset_min":"', variable('Offset'),
                  '","trigger":"', variable('Trigger'), '","series":[', *joined, ']}')
    reply = b.post(body, url)
    b.stop_if_refused(reply)
    complete = b.if_(reply.ref(as_text()), 99, string='"night_complete":true')
    b.save_marker()
    b.end_if(complete)
    by_hand = b.if_(variable('Trigger'), 4, string='manual')
    b.notify(b.dictionary_value(reply, 'message').ref())
    b.end_if(by_hand)

    return {
        'WFWorkflowClientVersion': '2700.0.4',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 431817727, 'WFWorkflowIconGlyphNumber': 59446},
        'WFWorkflowImportQuestions': b.questions,
        'WFWorkflowInputContentItemClasses': ['WFStringContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowTypes': [],
        'WFWorkflowActions': b.actions,
    }


def main():
    root = Path(__file__).resolve().parents[2]
    out_dir = root / 'private' / 'shortcut'
    out_dir.mkdir(parents=True, exist_ok=True)
    unsigned = out_dir / 'Clarivi Sync (unsigned).shortcut'
    signed = out_dir / 'Clarivi Sync.shortcut'
    with open(unsigned, 'wb') as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_BINARY)
    print(f'Built {unsigned.relative_to(root)}')
    if '--no-sign' in sys.argv:
        return
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
    print(f'Signed {signed.relative_to(root)} (keep it private: it carries the signer\'s Apple account details)')


if __name__ == '__main__':
    main()
