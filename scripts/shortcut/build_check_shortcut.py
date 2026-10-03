#!/usr/bin/env python3
"""Builds "Clarivi Check", a diagnostic Shortcut for when Clarivi Sync sends
no readings. It connects to nothing and needs no token. For each reading type
it shows how many readings the phone finds for yesterday and today, the time
of the first and last one, and the source. It never shows a reading's value.

Run:  python3 scripts/shortcut/build_check_shortcut.py
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


def main():
    root = Path(__file__).resolve().parents[2]
    out_dir = root / 'private' / 'shortcut'
    out_dir.mkdir(parents=True, exist_ok=True)
    unsigned = out_dir / 'Clarivi Check (unsigned).shortcut'
    signed = out_dir / 'Clarivi Check.shortcut'
    with open(unsigned, 'wb') as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_BINARY)
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
    print(f'Signed {signed.relative_to(root)}')


if __name__ == '__main__':
    main()
