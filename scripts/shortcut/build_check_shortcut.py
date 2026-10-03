#!/usr/bin/env python3
"""Builds "Clarivi Check", a diagnostic Shortcut for when Clarivi Sync sends
no readings. It connects to nothing and needs no token. For each reading type
it shows how many readings the phone finds for yesterday and today, the time
of the first and last one, and the source. It never shows a reading's value.

Run:  python3 scripts/shortcut/build_check_shortcut.py
      python3 scripts/shortcut/build_check_shortcut.py --trip 2026-07-31 2026-08-02
The --trip form builds "Clarivi Trip Check" instead: the sleep readings
between two dates (the second not included) as local times with their
offsets, for the time-zone check (does a past trip keep its time zone?).
      python3 scripts/shortcut/build_check_shortcut.py --files
The --files form builds "Clarivi File Check": three ways of saving a small
file to iCloud Drive/Shortcuts/Clarivi, each read back and shown, to find a
save that works for the "synced today" file.
      python3 scripts/shortcut/build_check_shortcut.py --size 2026-09
The --size form builds "Clarivi Size Check": heart rate for one week, half
a month and the whole month, each turned into the Sync Shortcut's columns,
with a notification after each step (count and time), to find how much a
Shortcut can handle before iOS stops it.
      python3 scripts/shortcut/build_check_shortcut.py --import 2026-09
The --import form builds "Clarivi Import Check": the Sync Shortcut's import
steps for one month, with a notification after the monthly readings and
after each day of heart rate. With --send it then posts the month to the
ingest function with a deliberately fake token (refused at once, nothing
stored), to see whether iOS lets a post that size leave the phone.
      python3 scripts/shortcut/build_check_shortcut.py --send-sizes 2026-09
The --send-sizes form builds "Clarivi Send Check": it gathers the month's
heart rate day by day and, after 1, 3, 7 and 14 days, posts what it has so
far with a deliberately fake token (refused at once, nothing stored), to find
how much Health data iOS lets one post carry. (1c: a whole month, about
20,000 readings in 2.2 MB, was stopped before it left the phone.)
      python3 scripts/shortcut/build_check_shortcut.py --sources
The --sources form builds "Clarivi Source Check": what the phone reports as
the source of each sleep reading, to fix sleep readings arriving without one.
Writes and signs private/shortcut/Clarivi Check.shortcut (kept private, like
the Sync Shortcut, because the signature carries the signer's Apple account).

Phase 1b spike (3 October 2026), found with earlier versions of this check:
- Health date filters only work in whole days. "Start Date is after" a time
  finds nothing; "between" two times and "in the last N hours" widen to whole
  days. Clarivi Sync uses "in the last 1 day" (yesterday and today).
- A date-only text such as "2026-10-03" becomes noon, not midnight.
- One loop pass per reading took over 14 minutes for 1,063 heart rate
  readings; joining each column as a list took about a second.
"""

import plistlib
import subprocess
import sys
from pathlib import Path

import build_shortcut as bs
from build_shortcut import Builder, Out, attachment, date_format, new_id, variable

SHOWN = 'yyyy-MM-dd HH:mm'


class CheckBuilder(Builder):
    def count(self, ref):
        action_id = new_id()
        self.add('count', {'UUID': action_id, 'WFCountType': 'Items', 'Input': attachment(ref), 'WFInput': attachment(ref)})
        return Out(action_id, 'Count')

    def item(self, out, which):
        action_id = new_id()
        self.add('getitemfromlist', {'UUID': action_id, 'WFItemSpecifier': which, 'WFInput': attachment(out.ref())})
        return Out(action_id, 'Item from List')

    def show(self, *parts):
        self.add('showresult', {'Text': bs.tokens(*parts)})

    def date_from(self, text):
        """A Date from text such as "2026-07-31" (read as noon that day, which
        is fine for Health filters, as they only work in whole days)."""
        action_id = new_id()
        self.add('date', {'UUID': action_id, 'WFDateActionMode': 'Specified Date', 'WFDateActionDate': bs.tokens(text)})
        return Out(action_id, 'Date')


def build():
    b = CheckBuilder()
    b.comment('Clarivi Check shows what Clarivi Sync finds in Health, without sending anything.')
    lines = []
    for label, _ in bs.HEALTH_TYPES:
        found = b.find_health(label)
        n = b.count(found.ref())
        first = b.item(found, 'First Item')
        last = b.item(found, 'Last Item')
        lines += [label, ': ', n.ref(), ', ', first.ref(bs.prop('Start Date'), date_format(SHOWN)),
                  ' to ', last.ref(bs.prop('Start Date'), date_format(SHOWN)), ', ',
                  first.ref(bs.prop('Source')), '\n']
    b.show(*lines[:-1])

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_trip(first_day, end_day):
    b = CheckBuilder()
    b.comment(f'Clarivi Trip Check shows the sleep readings from {first_day} until {end_day}, without sending anything.')
    start = b.date_from(first_day)
    end = b.date_from(end_day)
    sleep = b.find_health('Sleep', {'Operator': 1003, 'Values': {'Date': attachment(start.ref()),
                                                                 'AnotherDate': attachment(end.ref())}})
    n = b.count(sleep.ref())
    starts = b.combine(sleep.ref(bs.prop('Start Date'), date_format('MM-dd HH:mm XXXXX')), ', ')
    stages = b.combine(sleep.ref(bs.prop('Value')), ', ')
    b.show('Sleep readings: ', n.ref(), '\nStarts: ', starts.ref(), '\nStages: ', stages.ref())

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_files():
    b = CheckBuilder()
    b.comment('Clarivi File Check tries three ways of saving a small file, then reads each back.')
    today = bs.current_date(date_format('yyyy-MM-dd'))

    def save(text_out, path, input_ref=None):
        b.add('documentpicker.save', {'UUID': new_id(), 'WFInput': attachment(input_ref or text_out.ref()),
                                      'WFAskWhereToSave': False, 'WFFileDestinationPath': path,
                                      'WFSaveFileOverwrite': True})

    # A: the file name in the path, with a leading slash.
    save(b.text(today), '/Clarivi/check-a.txt')
    # B: the file name in the path, without the slash.
    save(b.text(today), 'Clarivi/check-b.txt')
    # C: what Clarivi Sync does now: name the text, then save it into the folder.
    named = new_id()
    c_text = b.text(today)
    b.add('setitemname', {'UUID': named, 'WFInput': attachment(c_text.ref()), 'WFName': 'check-c.txt'})
    save(c_text, 'Clarivi/', bs.output(named, 'Renamed Item'))

    lines = []
    for label in ['a', 'b', 'c']:
        action_id = new_id()
        b.add('documentpicker.open', {'UUID': action_id, 'WFGetFilePath': f'Clarivi/check-{label}.txt',
                                      'WFFileErrorIfNotFound': False, 'WFShowFilePicker': False})
        found = Out(action_id, 'File')
        lines += [f'{label.upper()}: ', found.ref(bs.prop('Name')), ' says ', found.ref(bs.as_text()), '\n']
    b.show(*lines[:-1])

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_sources():
    b = CheckBuilder()
    b.comment('Clarivi Source Check shows what the phone reports as the source of sleep readings.')
    sleep = b.find_health('Sleep')
    n = b.count(sleep.ref())
    sources = b.combine(sleep.ref(bs.prop('Source')), ' | ')
    names = b.combine(sleep.ref(bs.prop('Name')), ' | ')
    first = b.item(sleep, 'First Item')
    b.show('Sleep readings: ', n.ref(), '\nSources: ', sources.ref(), '\nNames: ', names.ref(),
           '\nFirst source: ', first.ref(bs.prop('Source')))

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_size(month):
    """Round 2 (3 October 2026): round 1 found 4,418 heart rate readings for one
    week and iOS stopped it while building that week's five columns; about
    1,100 to 1,500 readings had worked. This round tries 2, 4 and 7 days, each
    with all five columns and with the three the import would need (start,
    value, source), smallest first, notifying after each step."""
    b = CheckBuilder()
    b.comment(f'Clarivi Size Check builds heart rate columns for growing parts of {month}, without sending anything.')
    stamp = date_format('HH:mm:ss')
    first = b.date_from(f'{month}-01')
    lean = [c for c in bs.COLUMNS if c[0] in ('start', 'value', 'source')]
    steps = [('2 days', 3, lean), ('2 days', 3, bs.COLUMNS), ('4 days', 5, lean), ('4 days', 5, bs.COLUMNS),
             ('7 days', 8, lean), ('7 days', 8, bs.COLUMNS)]
    for label, end_day, columns in steps:
        end = b.date_from(f'{month}-{end_day:02d}')
        found = b.find_health('Heart Rate', {'Operator': 1003, 'Values': {'Date': attachment(first.ref()),
                                                                          'AnotherDate': attachment(end.ref())}})
        n = b.count(found.ref())
        for key, detail in columns:
            aggr = [bs.prop(detail)] + ([date_format(bs.ISO_TIME)] if detail.endswith('Date') else [])
            b.combine(found.ref(*aggr), bs.COLUMN_SEPARATOR)
        b.notify(f'{label}, {len(columns)} columns: ', n.ref(), ' readings done at ', bs.current_date(stamp))

    b.show('Clarivi Size Check finished at ', bs.current_date(stamp))
    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_import(month, send=False):
    b = CheckBuilder()
    b.comment(f'Clarivi Import Check runs the import steps for {month} without sending anything.')
    stamp = date_format('HH:mm:ss')
    b.set_variable('Month', b.date_from(f'{month}-01'))
    month_id = b.text(variable('Month', date_format('yyyy-MM')))
    later = b.adjust(variable('Month'), 'Add', bs.HOURS_TO_NEXT_MONTH, 'hr')
    next_month = b.date_from(later.ref(date_format('yyyy-MM-01')))
    whole_month = {'Operator': 1003, 'Values': {'Date': attachment(variable('Month')),
                                                'AnotherDate': attachment(next_month.ref())}}
    b.notify('Starting ', month_id.ref(), ' at ', bs.current_date(stamp))
    small = []
    for label, clarivi_type in bs.HEALTH_TYPES:
        if clarivi_type == 'heart_rate':
            continue
        found = b.find_health(label, whole_month)
        small.append(bs.series_text(b, clarivi_type, found))
        b.notify(f'{label}: ', b.count(found.ref()).ref(), ' readings at ', bs.current_date(stamp))
    bs.heart_rate_by_day(b, month_id, notify_each_day=True)
    joined = []
    for i, text in enumerate(small):
        joined += ([','] if i else []) + [text.ref()]
    body = b.text('{"schema_version":1,"kind":"backfill","month_id":"', month_id.ref(), '","series":[', *joined,
                  variable('HeartRateDays'), ']}')
    chars_id = new_id()
    b.add('count', {'UUID': chars_id, 'WFCountType': 'Characters', 'Input': attachment(body.ref()),
                    'WFInput': attachment(body.ref())})
    if send:
        b.set_variable('Token', b.text('clv_not-a-real-token'))
        b.notify('Sending ', bs.output(chars_id, 'Count'), ' characters at ', bs.current_date(stamp))
        reply = b.post(body, bs.INGEST_URL)
        b.notify('Sent at ', bs.current_date(stamp), '. The server said: ', reply.ref(bs.as_text()))
    b.show('Import check for ', month_id.ref(), ' finished at ', bs.current_date(stamp), '. The post was ',
           bs.output(chars_id, 'Count'), ' characters.')

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def build_send_sizes(month):
    b = CheckBuilder()
    b.comment(f'Clarivi Send Check posts growing parts of {month} with a fake token, to find the largest post iOS allows.')
    stamp = date_format('HH:mm:ss')
    b.set_variable('Token', b.text('clv_not-a-real-token'))
    b.set_variable('Day', b.date_from(f'{month}-01'))
    b.set_variable('HeartRateDays', b.text(''))
    label = 'Heart Rate'
    days = b.repeat_count(14)
    later = b.adjust(variable('Day'), 'Add', 24, 'hr')
    next_day = b.date_from(later.ref(date_format('yyyy-MM-dd')))
    one_day = {'Operator': 1003, 'Values': {'Date': attachment(variable('Day')),
                                            'AnotherDate': attachment(next_day.ref())}}
    found = b.find_health(label, one_day, 'Oldest First', bs.DAY_LIMIT)
    b.set_variable('HeartRateDays', b.text(variable('HeartRateDays'), ',', bs.series_text(b, 'heart_rate', found).ref()))
    b.set_variable('Readings', b.text(variable('Readings'), ' ', b.count(found.ref()).ref()))
    for checkpoint in ('1', '3', '7', '14'):
        at = b.if_(variable('Day', date_format('d')), 4, string=checkpoint)
        body = b.text('{"series":[{}', variable('HeartRateDays'), ']}')
        chars_id = new_id()
        b.add('count', {'UUID': chars_id, 'WFCountType': 'Characters', 'Input': attachment(body.ref()),
                        'WFInput': attachment(body.ref())})
        b.notify(f'{checkpoint} days: sending ', bs.output(chars_id, 'Count'), ' characters at ', bs.current_date(stamp))
        reply = b.post(body, bs.INGEST_URL)
        b.notify(f'{checkpoint} days: sent at ', bs.current_date(stamp), '. Server: ', reply.ref(bs.as_text()))
        b.end_if(at)
    b.set_variable('Day', next_day)
    b.end_repeat(days)
    b.show('Clarivi Send Check finished at ', bs.current_date(stamp), '. Readings per day:', variable('Readings'))

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def main():
    root = Path(__file__).resolve().parents[2]
    out_dir = root / 'private' / 'shortcut'
    out_dir.mkdir(parents=True, exist_ok=True)
    name = 'Clarivi Check'
    wf = None
    if '--trip' in sys.argv:
        i = sys.argv.index('--trip')
        name, wf = 'Clarivi Trip Check', build_trip(sys.argv[i + 1], sys.argv[i + 2])
    if '--send-sizes' in sys.argv:
        name, wf = 'Clarivi Send Check', build_send_sizes(sys.argv[sys.argv.index('--send-sizes') + 1])
    if '--import' in sys.argv:
        name, wf = 'Clarivi Import Check', build_import(sys.argv[sys.argv.index('--import') + 1], '--send' in sys.argv)
    if '--size' in sys.argv:
        name, wf = 'Clarivi Size Check', build_size(sys.argv[sys.argv.index('--size') + 1])
    if '--sources' in sys.argv:
        name, wf = 'Clarivi Source Check', build_sources()
    if '--files' in sys.argv:
        name, wf = 'Clarivi File Check', build_files()
    unsigned = out_dir / f'{name} (unsigned).shortcut'
    signed = out_dir / f'{name}.shortcut'
    with open(unsigned, 'wb') as f:
        plistlib.dump(wf or build(), f, fmt=plistlib.FMT_BINARY)
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
    print(f'Signed {signed.relative_to(root)}')


if __name__ == '__main__':
    main()
