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
from build_shortcut import Builder, Out, attachment, date_format, new_id

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


def main():
    root = Path(__file__).resolve().parents[2]
    out_dir = root / 'private' / 'shortcut'
    out_dir.mkdir(parents=True, exist_ok=True)
    name = 'Clarivi Check'
    wf = None
    if '--trip' in sys.argv:
        i = sys.argv.index('--trip')
        name, wf = 'Clarivi Trip Check', build_trip(sys.argv[i + 1], sys.argv[i + 2])
    unsigned = out_dir / f'{name} (unsigned).shortcut'
    signed = out_dir / f'{name}.shortcut'
    with open(unsigned, 'wb') as f:
        plistlib.dump(wf or build(), f, fmt=plistlib.FMT_BINARY)
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
    print(f'Signed {signed.relative_to(root)}')


if __name__ == '__main__':
    main()
