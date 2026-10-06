"""Plan tab (progress.md), with live ticks."""
import re
from mdlib import esc, inl, plain, slug, split_label
from common import (ICON, MONTHS, blocks_html, list_html, sec_open, sub_head, toc_html, doc_head,
                    last_updated_html, details, plan_blocks, table_html)
from taskids import TASK_RE, group_key, assign

T = 'plan'
DATE = rf'\d{{1,2}} (?:{MONTHS}) 2026'


def _balanced(text, start):
    depth = 0
    for k in range(start, len(text)):
        if text[k] == '(':
            depth += 1
        elif text[k] == ')':
            depth -= 1
            if depth == 0:
                return k
    return -1


def split_task(text):
    """Separate a task's own words from the dated result notes added as it was done."""
    note = []
    main = text
    k = 0
    while True:
        i = main.find('(', k)
        if i < 0:
            break
        j = _balanced(main, i)
        if j < 0:
            break
        inner = main[i + 1:j]
        if re.search(DATE, inner) and not inner.startswith('`'):
            note.append(inner)
            main = (main[:i].rstrip() + main[j + 1:]).strip()
            break
        k = j + 1
    m = re.search(rf'\.\s+((?:Released|Done|Prepared|Built|Tested)\b.*|{DATE}:.*)$', main)
    if m:
        note.append(m.group(1))
        main = main[:m.start()] + '.'
    main = re.sub(r'\s+([:;,.])', r'\1', main).strip()
    return main, ' '.join(note)


def collect_tasks(doc, old):
    tasks = []
    for s in doc['secs']:
        m = re.match(r'Phase (\d)', s['name'])
        if not m:
            continue
        ph = m.group(1)
        for sub in s['subs']:
            for b in sub['blocks']:
                if b['t'] != 'list':
                    continue
                for it in b['items']:
                    mm = TASK_RE.match(it['text'])
                    if mm:
                        t = {'phase': ph, 'group': group_key(ph, sub['title']), 'text': mm.group(2),
                             'done': mm.group(1) == 'x', 'item': it, 'main_text': plain(split_task(mm.group(2))[0])}
                        it['task'] = t
                        tasks.append(t)
    assign(tasks, old)
    return tasks


def task_li(t):
    tid = t['id']
    main, note = split_task(t['text'])
    sub = ''.join(list_html(b, T) if b['t'] == 'list' else blocks_html([b], T) for b in t['item']['blocks'])
    res = ''
    if note:
        if len(note) > 220:
            short = re.match(rf'^(.*?{DATE})', note)
            label = 'Result, ' + short.group(1) if short and len(short.group(1)) < 70 else 'Result'
            label = re.sub(r'^Result, (Released|Done|Prepared|Built|Tested)\b', lambda m: m.group(1), label)
            res = details(esc(label), f'<p>{inl(note, T)}</p>', 'more')
        else:
            res = f'<p class="task-result">{inl(note, T)}</p>'
    return (f'<li class="task" id="{tid}" data-task="{tid}" data-phase="{t["phase"]}" data-md-done="{1 if t["done"] else 0}" '
            f'data-text="{esc(plain(main))}"><input type="checkbox" class="tick" id="cb-{tid}" data-task="{tid}" disabled '
            f'aria-describedby="tid-{tid}"><div class="task-body"><label for="cb-{tid}" class="task-text">{inl(main, T)}</label>'
            f'{sub}{res}<p class="task-note" hidden></p></div><div class="task-meta"><span class="tid mono" id="tid-{tid}">{tid}</span>'
            f'<span class="done-when"></span></div></li>')


def verifies(lst):
    out = ['<ol class="verifies">']
    for n, it in enumerate(lst['items'], 1):
        lab, rest, _ = split_label(it['text'])
        exp = ''
        for b in it['blocks']:
            if b['t'] == 'p':
                em = re.match(r'\*Expected:\*\s*(.*)', b['text'])
                if em:
                    exp = em.group(1)
        exp_html = (f'<div class="expected"><span class="exp-label">{ICON["check13"]} Expected</span>'
                    f'<p>{inl(exp, T)}</p></div>') if exp else ''
        out.append(f'<li class="verify"><span class="v-num">{n}</span><div class="v-body"><h4>{inl(lab or "", T)}</h4>'
                   f'<p>{inl(rest[:1].upper() + rest[1:], T)}</p>{exp_html}</div></li>')
    out.append('</ol>')
    return ''.join(out)


def tests(lst):
    return '<ul class="card icon-list tests">' + ''.join(
        f'<li>{ICON["flask"]}<span>{inl(it["text"], T)}{blocks_html(it["blocks"], T, nested=True)}</span></li>'
        for it in lst['items']) + '</ul>'


def status_parts(text):
    m = re.match(r'([A-Z][^(:.]*)', text)
    return (m.group(1).strip() if m else text[:40])


def phase_section(s):
    ph = re.match(r'Phase (\d)', s['name']).group(1)
    name = s['name'].split(': ', 1)[1]
    so, sid = sec_open(T, ph, name, 'sec phase', f'plan-phase-{ph}')
    goal = ''
    status = ''
    rest = []
    pre = s['pre']
    i = 0
    while i < len(pre):
        b = pre[i]
        if b['t'] == 'p' and b['text'].startswith('**Goal:**'):
            g = split_label(b['text'])[1]
            g = g[:1].upper() + g[1:]
            lst = ''
            if i + 1 < len(pre) and pre[i + 1]['t'] == 'list':
                lst = list_html(pre[i + 1], T)
                i += 1
            goal = f'<div class="goal"><span class="eyebrow">Goal</span><p>{inl(g, T)}</p>{lst}</div>'
        elif b['t'] == 'p' and b['text'].startswith('**Status:**'):
            status = split_label(b['text'])[1]
        else:
            rest.append(b)
        i += 1
    short = status_parts(status)
    if len(status) > 240:
        st = f'<div class="phase-status"><span class="eyebrow">Status</span>{details(inl(short, T), "<p>" + inl(status, T) + "</p>", "more")}</div>'
    else:
        st = f'<div class="phase-status"><span class="eyebrow">Status</span><p>{inl(status, T)}</p></div>'
    out = [so, '<div class="phase-head card">', goal, st,
           f'<div class="phase-meta"><span class="chip st" data-phase-status="{ph}">{esc(short)}</span>'
           f'<span class="muted small" data-phase-count="{ph}"></span><span class="bar"><i data-phase-bar="{ph}"></i></span></div></div>']
    out.append(plan_blocks(rest, T))
    for sub in s['subs']:
        title = sub['title']
        key = ''
        km = re.match(r'(\d[a-z])\.\s+(.*)', title)
        if km:
            key, title = km.group(1), km.group(2)
        elif title.startswith('End of Phase'):
            key = 'End'
        out.append('<div class="sub-block">' + sub_head(inl(title, T), key=key))
        for b in sub['blocks']:
            if b['t'] == 'list' and b['items'] and 'task' in b['items'][0]:
                out.append('<ul class="tasks card">' + ''.join(task_li(it['task']) for it in b['items'] if 'task' in it) + '</ul>')
            elif b['t'] == 'list' and sub['title'] == 'Automated tests':
                out.append(tests(b))
            elif b['t'] == 'list' and sub['title'] == 'Manual verification':
                out.append(verifies(b))
            else:
                out.append(plan_blocks([b], T) if b['t'] != 'list' else f'<div class="card">{list_html(b, T)}</div>')
        out.append('</div>')
    out.append('</section>')
    return ''.join(out), sid, f'{ph}. {name.split(" (")[0]}', ph, name.split(' (')[0], status


def summary(s, phases):
    lst = next(b for b in s['blocks'] if b['t'] == 'list')
    items = {}
    order = []
    for it in lst['items']:
        lab, rest, _ = split_label(it['text'])
        items[lab] = (rest, it)
        order.append(lab)
    cur = items.get('Current phase', ('', None))[0]
    nxt_key = next((k for k in order if k.startswith('Next action')), None)
    nxt = items[nxt_key][0] if nxt_key else ''
    out = ['<div class="plan-hero card"><div class="ph-top"><div><div class="eyebrow">Current phase</div>'
           '<div class="ph-cur" id="cur-phase">Loading</div></div>'
           '<div class="ph-ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" class="ring-bg"/>'
           '<circle cx="32" cy="32" r="27" class="ring-fg" id="ring-fg" pathLength="100" stroke-dasharray="0 100"/></svg>'
           '<span id="ring-pct">0%</span></div></div>'
           '<div class="ph-bar"><div class="bar"><i id="all-bar" style="width:0%"></i></div><span class="ph-count" id="all-count">0 tasks done</span></div>'
           '<dl class="meta stacked">'
           f'<div class="meta-row"><dt>Overall status</dt><dd>{inl(cur, T)}</dd></div>'
           f'<div class="meta-row"><dt>{esc(nxt_key or "Next action")}</dt><dd class="next-action">{inl(nxt, T)}</dd></div>'
           '<div class="meta-row"><dt>Next open task</dt><dd id="next-task"><span class="muted">Loading</span></dd></div></dl>'
           '<p class="tick-sync" id="tick-sync" data-state="loading"><i></i><span>Loading ticks</span></p></div>']
    # phase cards
    cards = []
    for ph, name, status in phases:
        short = status_parts(status)
        cards.append(f'<a class="phase-card" href="#plan-phase-{ph}" data-phase="{ph}" data-md-status="{esc(status)}">'
                     f'<span class="pc-num">{ph}</span><span class="pc-name">{esc(name)}</span><span class="pc-foot">'
                     f'<span class="chip st" data-phase-status="{ph}">{esc(short)}</span><span class="pc-count" data-phase-count="{ph}"></span></span>'
                     f'<span class="bar"><i data-phase-bar="{ph}"></i></span></a>')
    out.append('<h3 class="sub-title">Phases</h3><div class="phase-cards">' + ''.join(cards) + '</div>')
    # status by phase table, set-up table and the region note
    blocks = s['blocks']
    rest_blocks = [b for b in blocks if b is not lst]
    i = 0
    tail = []
    while i < len(rest_blocks):
        b = rest_blocks[i]
        if b['t'] == 'table' and b['head'][:2] == ['Phase', 'Name']:
            rows = ''.join(f'<div class="dec"><div class="dec-topic"><span class="mono muted">{esc(r[0])}</span> {inl(r[1], T)}</div>'
                           f'<div class="dec-text">{inl(r[2], T)}</div></div>' for r in b['rows'])
            out.append(f'<h3 class="sub-title">Status by phase</h3><div class="card decisions">{rows}</div>')
        elif b['t'] == 'p' and b['text'].startswith('**Set-up so far') and i + 1 < len(rest_blocks) and rest_blocks[i + 1]['t'] == 'table':
            lab = split_label(b['text'])[0]
            t = rest_blocks[i + 1]
            kv = ''.join(f'<div class="kv"><div class="kv-k">{inl(r[0], T)}</div><div class="kv-v">{inl(r[1], T)}</div></div>' for r in t['rows'])
            tail.append(f'<h3 class="sub-title">{inl(lab, T)}</h3><div class="card"><div class="kv-list">{kv}</div></div>')
            i += 2
            continue
        elif b['t'] == 'p' and b['text'].startswith('Requirement numbers'):
            tail.append(f'<p class="muted small">{inl(b["text"], T)}</p>')
        else:
            tail.append(plan_blocks([b], T))
        i += 1
    if 'Known issues' in items:
        ki = items['Known issues'][1]
        out.append('<h3 class="sub-title">Known issues</h3>' + ''.join(
            f'<div class="card">{list_html(b, T)}</div>' for b in ki['blocks'] if b['t'] == 'list'))
    # progress log
    log = []
    for lab in order:
        if lab in ('Current phase', 'Known issues') or lab == nxt_key:
            continue
        rest, it = items[lab]
        body = (f'<p>{inl(rest, T)}</p>' if rest.strip() else '') + ''.join(
            list_html(b, T) if b['t'] == 'list' else f'<p>{inl(b["text"], T)}</p>' if b['t'] == 'p' else blocks_html([b], T)
            for b in it['blocks'])
        log.append(details(inl(lab, T), body, 'log'))
    out.append('<h3 class="sub-title">Progress log</h3><p class="muted small">Tap a line to open it.</p>'
               f'<div class="card log-card">{"".join(log)}</div>')
    out += tail
    return ''.join(out)


def build(doc, old_ids):
    tasks = collect_tasks(doc, old_ids)
    m = doc['meta']
    head = doc_head('Plan', 'progress.md', 'Progress', 'Clarivi', m.get('Status of this plan'),
                    [('Last updated', last_updated_html(m.get('Last updated'), T)),
                     ('Builds on', inl(m.get('Builds on', ''), T))], [], T)
    phases_html = []
    phases = []
    toc = []
    for s in doc['secs']:
        if s['name'].startswith('Phase'):
            h, sid, label, ph, name, status = phase_section(s)
            phases_html.append(h)
            phases.append((ph, name, status))
            toc.append((sid, label, []))
    sm = next(s for s in doc['secs'] if s['name'] == 'Summary')
    so, sid = sec_open(T, '', 'Summary', 'sec', 'plan-summary')
    body = head + so + summary(sm, phases) + '</section>' + ''.join(phases_html)
    return toc_html(T, 'Plan', [(sid, 'Summary', [])] + toc), body, tasks
