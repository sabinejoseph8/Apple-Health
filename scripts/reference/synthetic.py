"""A made-up history for checking the database against the reference.

Seeded, so every run is the same. It includes the awkward cases the rules
exist for: long awake spells inside a night (D50), a second, coarse set of
stages on top of the Watch's (D49), a second watch and an app (D56, D57), afternoon naps, nights without HRV or
breathing rate, nights with too few heart rate readings, a week away 8 hours
ahead, gaps with no sleep recorded, and a last night that isn't finished.
No real readings.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

HOME = -300


def _ts(local: datetime, offset: int) -> datetime:
    return (local - timedelta(minutes=offset)).replace(tzinfo=timezone.utc)


def make(days: int = 75, seed: int = 7, start: date = date(2026, 6, 1)) -> Dict[str, List[dict]]:
    rnd = random.Random(seed)
    samples: List[dict] = []
    uploads: List[dict] = []

    def add(type_, s_local, e_local, offset, value=None, stage=None, source='Test Watch'):
        samples.append({'type': type_, 'start_at': _ts(s_local, offset), 'end_at': _ts(e_local, offset),
                        'tz_offset_min': offset, 'value': value, 'stage': stage,
                        'source_name': None if type_ == 'sleep_stage' else source})

    for i in range(days):
        d = start + timedelta(days=i)
        offset = 480 if 40 <= i < 47 else HOME
        # Bedtime: about 11pm the evening before.
        evening = datetime(d.year, d.month, d.day) - timedelta(hours=1) + timedelta(minutes=rnd.randint(-70, 60))
        uploads.append({'kind': 'daily', 'local_date': d,
                        'received_at': _ts(datetime(d.year, d.month, d.day, 7, 30), offset)})
        if i % 11 == 5 or i in (20, 21, 22):
            continue  # no sleep recorded
        t = evening
        wake = datetime(d.year, d.month, d.day, 6, 30) + timedelta(minutes=rnd.randint(-60, 90))
        long_break = i % 9 == 3
        while t < wake:
            stage = rnd.choice(['core', 'core', 'deep', 'rem'])
            length = timedelta(minutes=rnd.randint(8, 45))
            end = min(t + length, wake)
            add('sleep_stage', t, end, offset, stage=stage)
            t = end
            if long_break and t > datetime(d.year, d.month, d.day, 3, 0) and t < datetime(d.year, d.month, d.day, 3, 50):
                gap = timedelta(minutes=rnd.randint(95, 140))
                add('sleep_stage', t, t + gap, offset, stage='awake')
                t += gap
                long_break = False
            elif rnd.random() < 0.15:
                gap = timedelta(minutes=rnd.randint(1, 6))
                add('sleep_stage', t, t + gap, offset, stage='awake')
                t += gap
        if i % 13 == 7:
            # Another app's coarse stages on top of the Watch's.
            add('sleep_stage', evening + timedelta(minutes=5), wake - timedelta(minutes=10), offset, stage='deep')
            add('sleep_stage', evening, evening + timedelta(minutes=20), offset, stage='awake')
        if i % 6 == 2:
            nap = datetime(d.year, d.month, d.day, 13, 30)
            add('sleep_stage', nap, nap + timedelta(minutes=rnd.randint(30, 150)), offset, stage='core')

        bad = i % 10 == 4
        hr_every = 60 if i % 17 == 9 else 5  # a night with too few readings
        h = evening - timedelta(hours=4)
        while h < wake + timedelta(hours=4):
            if h.hour >= 18 or h.hour < 12:
                # Some weeks with a second watch worn too (D56, D57).
                second = 14 <= i < 24 and len(samples) % 7 == 0
                add('heart_rate', h, h, offset, value=rnd.randint(50, 60) + (6 if bad else 0),
                    source='Second Watch' if second else 'Test Watch')
            h += timedelta(minutes=hr_every if evening <= h <= wake else 30)
        if i % 8 != 1:
            for k in range(rnd.randint(1, 4)):
                hv = evening + timedelta(minutes=60 + 110 * k)
                add('hrv_sdnn', hv, hv + timedelta(minutes=1), offset, value=round(rnd.uniform(30, 70) - (15 if bad else 0), 3))
        if i % 12 != 3:
            r = evening + timedelta(minutes=30)
            while r < wake:
                add('respiratory_rate', r, r, offset, value=round(rnd.uniform(13.5, 16.5) + (1.5 if bad else 0), 1))
                r += timedelta(minutes=20)
        rs = datetime(d.year, d.month, d.day) - timedelta(days=1) + timedelta(minutes=5)
        add('resting_hr', rs, rs + timedelta(hours=23, minutes=50), offset, value=rnd.randint(55, 62) + (4 if bad else 0))
        if 14 <= i < 24:
            add('resting_hr', rs, rs + timedelta(hours=23, minutes=50), offset, value=rnd.randint(55, 62),
                source='Second Watch')
        if i % 5 == 0:
            # An app's results, which don't count (R15).
            add('resting_hr', rs, rs + timedelta(hours=23, minutes=50), offset, value=80, source='Some App')
            add('hrv_sdnn', evening + timedelta(minutes=90), evening + timedelta(minutes=91), offset, value=99,
                source='Some App')

    # The last morning's sync came before waking, so that night is unfinished.
    last = uploads[-1]
    last['received_at'] = last['received_at'] - timedelta(hours=3)
    return {'samples': samples, 'uploads': uploads}
