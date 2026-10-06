"""Give each task in progress.md a stable id, so its tick on the Clarivi Memory site stays put.

Ids already in use are kept by matching the task's words against `assets/task-ids.json` (written
by every build) and, optionally, the texts stored with the ticks. A task with no match gets the
next free id in its group. Ids look like p1a-01, p2-03 or p1-review (the scheme of the first build).
"""
import difflib
import json
import os
import re
from mdlib import plain

TASK_RE = re.compile(r'\[( |x)\]\s+(.*)', re.S)

# A task whose words changed too much to match automatically: new text prefix -> old id.
OVERRIDES = {
    'Build in-app consent': 'p6-06',
}


def norm(s):
    s = plain(s).lower()
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def known_ids(ids_json, ticks_dir=None):
    """{id: {'phase': '1', 'texts': [...]}} from the last build, plus texts stored with the ticks."""
    found = {}
    if os.path.exists(ids_json):
        for tid, v in json.load(open(ids_json, encoding='utf-8')).items():
            found[tid] = {'phase': v['phase'], 'texts': list(v['texts'])}
    if ticks_dir and os.path.isdir(ticks_dir):
        for f in os.listdir(ticks_dir):
            if f.endswith('.json'):
                d = json.load(open(os.path.join(ticks_dir, f), encoding='utf-8'))
                tid = f[:-5]
                found.setdefault(tid, {'phase': tid[1], 'texts': []})
                if d.get('text'):
                    found[tid]['texts'].append(d['text'])
    return found


def save_ids(ids_json, tasks, known):
    """Keep each id's current words first, then up to two earlier versions."""
    out = {}
    for t in tasks:
        texts = [t['main_text']] + [x for x in known.get(t['id'], {}).get('texts', []) if x != t['main_text']]
        out[t['id']] = {'phase': str(t['phase']), 'texts': texts[:3]}
    json.dump(out, open(ids_json, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    open(ids_json, 'a').write('\n')


def group_key(phase, sub_title):
    m = re.match(r'(\d)([a-z])\.', sub_title)
    if m:
        return f'p{phase}{m.group(2)}'
    return f'p{phase}'


def assign(tasks, old):
    """tasks: list of dicts with phase, group, text. Adds 'id' and 'matched'."""
    used = set()
    for t in tasks:
        for pre, tid in OVERRIDES.items():
            if plain(t['text']).startswith(pre) and tid in old and tid not in used:
                t['id'] = tid
                t['matched'] = 'override'
                used.add(tid)
    pairs = []
    for i, t in enumerate(tasks):
        if 'id' in t:
            continue
        a = norm(t['text'])[:90]
        for tid, o in old.items():
            if o['phase'] != str(t['phase']) or tid in used:
                continue
            best = 0
            for ot in o['texts']:
                b = norm(ot)[:90]
                n = min(len(a), len(b), 70)
                best = max(best, difflib.SequenceMatcher(None, a[:n], b[:n]).ratio())
            if best >= 0.72:
                pairs.append((best, i, tid))
    pairs.sort(reverse=True)
    for r, i, tid in pairs:
        if 'id' in tasks[i] or tid in used:
            continue
        tasks[i]['id'] = tid
        tasks[i]['matched'] = round(r, 2)
        used.add(tid)
    for t in tasks:
        if 'id' in t:
            continue
        g = t['group']
        n = 1
        taken = used | set(old)
        while f'{g}-{n:02d}' in taken:
            n += 1
        t['id'] = f'{g}-{n:02d}'
        t['matched'] = 'new'
        used.add(t['id'])
    return tasks
