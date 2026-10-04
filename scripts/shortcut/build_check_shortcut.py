#!/usr/bin/env python3
"""Builds "Clarivi Check", a diagnostic Shortcut for when Clarivi Sync sends
no readings. It connects to nothing and needs no token. For each reading type
it shows how many readings the phone finds for yesterday and today, the time
of the first and last one, and the source. It never shows a reading's value.

Run:  python3 scripts/shortcut/build_check_shortcut.py
      python3 scripts/shortcut/build_check_shortcut.py --import 2026-09
The --import form builds "Clarivi Import Check": the Sync Shortcut's import
steps for one month, without sending anything, with a notification after
the monthly readings and after each day of heart rate, to see where an import
stops on a phone.
Writes and signs private/shortcut/<name>.shortcut (kept private, like the
Sync Shortcut, because the signature carries the signer's Apple account).

Phase 1b spike (3 October 2026), found with earlier versions of this check:
- Health date filters only work in whole days. "Start Date is after" a time
  finds nothing; "between" two times and "in the last N hours" widen to whole
  days. Clarivi Sync uses "in the last 1 day" (yesterday and today).
- A date-only text such as "2026-10-03" becomes noon, not midnight.
- One loop pass per reading took over 14 minutes for 1,063 heart rate
  readings; joining each column as a list took about a second.
Phase 1c (3 October 2026): further one-off checks (trip time zones, saving
files, sleep sources, step size, post size) are described in
docs/progress.md and tech-spec.md section 4, and are in this file's history.
"""

import plistlib
import subprocess
import sys
from pathlib import Path

import build_shortcut as bs
from build_shortcut import Builder, Out, attachment, date_format, new_id, variable

SHOWN = 'yyyy-MM-dd HH:mm'


class CheckBuilder(Builder):
    def item(self, out, which):
        action_id = new_id()
        self.add('getitemfromlist', {'UUID': action_id, 'WFItemSpecifier': which, 'WFInput': attachment(out.ref())})
        return Out(action_id, 'Item from List')

    def show(self, *parts):
        self.add('showresult', {'Text': bs.tokens(*parts)})



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


def build_import(month):
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
    b.show('Import check for ', month_id.ref(), ' finished at ', bs.current_date(stamp), '. The post would be ',
           bs.output(chars_id, 'Count'), ' characters.')

    wf = bs.build()
    wf['WFWorkflowActions'] = b.actions
    wf['WFWorkflowImportQuestions'] = []
    wf['WFWorkflowInputContentItemClasses'] = []
    return wf


def main():
    root = Path(__file__).resolve().parents[2]
    out_dir = root / 'private' / 'shortcut'
    out_dir.mkdir(parents=True, exist_ok=True)
    name, wf = 'Clarivi Check', None
    if '--import' in sys.argv:
        name, wf = 'Clarivi Import Check', build_import(sys.argv[sys.argv.index('--import') + 1])
    unsigned = out_dir / f'{name} (unsigned).shortcut'
    signed = out_dir / f'{name}.shortcut'
    with open(unsigned, 'wb') as f:
        plistlib.dump(wf or build(), f, fmt=plistlib.FMT_BINARY)
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
    print(f'Signed {signed.relative_to(root)}')


if __name__ == '__main__':
    main()
