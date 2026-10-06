"""Product Spec tab."""
import re
from mdlib import esc, inl, plain, slug, split_label
from common import (ICON, blocks_html, list_html, notes_html, sec_open, sub_head, paren_note, dec_rows,
                    oq_cards, toc_html, doc_head, last_updated_html, figs)

T = 'product'


def overview(sec):
    paras = {}
    v1_list = None
    order = []
    for i, b in enumerate(sec['blocks']):
        if b['t'] == 'p':
            lab, rest, _ = split_label(b['text'])
            paras[lab] = rest
            order.append(lab)
        elif b['t'] == 'list':
            v1_list = b
    core = paras.get('The core value', '')
    first, _, after = core.partition('; this tool explains them.')
    quote = first + '; this tool explains them.' if after or first else core
    out = ['<div class="ov-grid">',
           f'<figure class="value-quote"><div class="eyebrow">core value</div><blockquote>{inl(quote, T)}</blockquote>'
           f'<figcaption>{inl(after.strip(), T)}</figcaption></figure>',
           f'<div class="card lead-card"><div class="eyebrow">What it is</div><p class="lead">{inl(paras.get("What it is", ""), T)}</p></div>',
           f'<div class="card"><div class="eyebrow">Who it is for</div><p>{inl(paras.get("Who it is for", ""), T)}</p></div>',
           '</div>']
    v1 = paras.get('v1 (the MVP)', '')
    tiles = ''
    if v1_list:
        tiles = '<div class="tiles">' + ''.join(
            f'<div class="tile"><div class="tile-t">{inl(split_label(it["text"])[0], T)}</div>'
            f'<p>{inl(split_label(it["text"])[1][:1].upper() + split_label(it["text"])[1][1:], T)}</p></div>'
            for it in v1_list['items']) + '</div>'
    out.append(f'<div class="card"><div class="eyebrow">v1, the MVP</div><p>{inl(v1, T)}</p>{tiles}</div>')
    return ''.join(out)


def goals(sec):
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    return '<ol class="goals card">' + ''.join(
        f'<li><span class="gnum">{i}</span><p>{inl(it["text"], T)}</p></li>' for i, it in enumerate(lst['items'], 1)) + '</ol>'


def users(sec):
    out = []
    for b in sec['blocks']:
        if b['t'] == 'table':
            out.append('<div class="grid2">')
            head = [h.rstrip('?') for h in b['head']]
            for r in b['rows']:
                rows = ''.join(f'<div class="meta-row"><dt>{esc(head[j])}</dt><dd>{inl(r[j], T)}</dd></div>' for j in range(1, len(r)))
                out.append(f'<div class="card user-card"><h3 class="card-title">{inl(r[0], T)}</h3><dl class="meta stacked">{rows}</dl></div>')
            out.append('</div>')
        elif b['t'] == 'list':
            out.append('<div class="card"><h3 class="card-title small">Access rules</h3><ul class="icon-list">' + ''.join(
                f'<li>{ICON["lock"]}<span>{inl(it["text"], T)}</span></li>' for it in b['items']) + '</ul></div>')
    return ''.join(out)


def stories(sec):
    out = ['<div class="grid2 masonry">']
    for sub in sec['subs']:
        items = []
        for b in sub['blocks']:
            if b['t'] == 'list':
                for it in b['items']:
                    m = re.match(r'(As (?:a tester|the owner),)\s*(.*)', it['text'])
                    if m:
                        items.append(f'<li><span class="role">{esc(m.group(1))}</span> {inl(m.group(2), T)}</li>')
                    else:
                        items.append(f'<li>{inl(it["text"], T)}</li>')
        out.append(f'<div class="card"><h3 class="card-title">{inl(sub["title"], T)}</h3><ul class="stories">{"".join(items)}</ul></div>')
    out.append('</div>')
    return ''.join(out)


def requirements(sec):
    total = 0
    areas = []
    for sub in sec['subs']:
        rows = []
        nums = []
        for b in sub['blocks']:
            if b['t'] != 'list':
                continue
            for it in b['items']:
                m = re.match(r'\*\*R(\d+)(?:\s+(.+?))?\*\*\s*(.*)$', it['text'])
                if not m:
                    continue
                n, name, rest = m.group(1), m.group(2), m.group(3)
                nums.append(int(n))
                nm = f'<strong class="req-name">{inl(name, T, links=False)}</strong> ' if name else ''
                rows.append(f'<div class="req" id="R{n}"><a class="rid" href="#R{n}" aria-label="Requirement R{n}">R{n}</a>'
                            f'<div class="req-text">{nm}{inl(rest, T)}{blocks_html(it["blocks"], T, nested=True)}</div></div>')
        total += len(rows)
        rng = f'R{min(nums)} to R{max(nums)} · {len(nums)}' if len(nums) > 1 else f'R{nums[0]} · 1'
        areas.append(f'<div class="card req-area"><div class="req-area-head"><h3 class="card-title">{inl(sub["title"], T)}</h3>'
                     f'<span class="muted small">{rng}</span></div>{"".join(rows)}</div>')
    return ('<div class="filter"><label for="req-filter" class="sr">Filter requirements</label>'
            '<input id="req-filter" type="search" placeholder="Filter, for example push, R23 or password" autocomplete="off">'
            f'<span class="filter-count" id="req-count" aria-live="polite">{total} requirements</span></div>'
            '<p class="empty" id="req-empty" hidden>No requirement matches that. Try a shorter word.</p>'
            '<div class="req-areas">' + ''.join(areas) + '</div>')


def layout(sec):
    out = ['<div class="grid2">']
    blocks = sec['blocks']
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p':
            lab, rest, _ = split_label(b['text'])
            m = re.match(r'(.*?)\s*\((\w+)\)$', lab or '')
            title = f'{esc(m.group(1))} <span class="chip">{esc(m.group(2))}</span>' if m else esc(lab or '')
            body = ''
            if i + 1 < len(blocks) and blocks[i + 1]['t'] == 'list':
                body = list_html(blocks[i + 1], T)
                i += 1
            out.append(f'<div class="card"><h3 class="card-title">{title}</h3>{body}</div>')
        i += 1
    out.append('</div>')
    return ''.join(out)


def out_of_scope(sec):
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    return '<div class="card"><ul class="x-list">' + ''.join(
        f'<li>{ICON["x"]}<span>{inl(it["text"], T)}</span></li>' for it in lst['items']) + '</ul></div>'


def future(sec):
    t = next(b for b in sec['blocks'] if b['t'] == 'table')
    out = ['<div class="card pairs"><div class="pair head">'
           f'<div class="pair-a">{inl(t["head"][0], T)}</div><div class="pair-arrow"></div><div class="pair-b">{inl(t["head"][1], T)}</div></div>']
    for r in t['rows']:
        out.append(f'<div class="pair"><div class="pair-a">{inl(r[0], T)}</div><div class="pair-arrow" aria-hidden="true">→</div>'
                   f'<div class="pair-b">{inl(r[1], T)}</div></div>')
    out.append('</div>')
    return ''.join(out)


def success(sec):
    out = []
    blocks = sec['blocks']
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p' and b['text'].startswith('**Checks'):
            lab = split_label(b['text'])[0]
            lst = blocks[i + 1]
            items = ''.join(f'<li><span class="check-ic">{ICON["check14"]}</span><span>{inl(it["text"], T)}</span></li>'
                            for it in lst['items'])
            out.append(f'<div class="card"><h3 class="card-title">{inl(lab, T)}</h3><ul class="icon-list checks">{items}</ul></div>')
            i += 2
            continue
        if b['t'] == 'p' and b['text'].startswith('**Test targets'):
            lab, rest, _ = split_label(b['text'])
            note = rest.strip().strip('()')
            out.append('<h3 class="sub-title">Test targets</h3>')
            if note:
                out.append(f'<div class="callout warn small">{ICON["lock"]}<span>Targets {inl(note, T)}.</span></div>')
            lst = blocks[i + 1]
            tiles = ''.join(f'<div class="tile"><div class="tile-t">{inl(split_label(it["text"])[0], T)}</div>'
                            f'<p>{figs(inl(split_label(it["text"])[1], T))}</p></div>' for it in lst['items'])
            out.append(f'<div class="tiles tiles-3">{tiles}</div>')
            i += 2
            continue
        out.append(blocks_html([b], T))
        i += 1
    return ''.join(out)


def decisions(sec):
    out = []
    for sub in sec['subs']:
        title, note = paren_note(sub['title'])
        out.append('<div class="sub-block">' + sub_head(esc(title), esc(note)))
        for b in sub['blocks']:
            if b['t'] == 'table':
                out.append(dec_rows(b, T))
            elif b['t'] == 'list':
                out.append(oq_cards(b, T))
            else:
                out.append(blocks_html([b], T))
        out.append('</div>')
    return ''.join(out)


RENDER = {
    'Overview': overview, 'Goals': goals, 'Users': users, 'User stories': stories,
    'Functional requirements': requirements, 'Layout and responsiveness': layout,
    'Out of scope for v1': out_of_scope, 'Future features and what v1 must do to leave room': future,
    'Success criteria': success, 'Decisions and open questions': decisions,
}


def build(doc):
    m = doc['meta']
    sub = re.sub(r'^Product Spec:\s*', '', doc['title'])
    note = next((l.lstrip('> ').strip() for l in doc['extra'] if l.startswith('>')), '')
    head = doc_head('Product Spec', 'product-spec.md', 'Product Spec', sub, m.get('Status'),
                    [('Last updated', last_updated_html(m.get('Last updated'), T)),
                     ('Owner', esc(m.get('Owner', ''))), ('Sources', inl(m.get('Sources', ''), T))],
                    [inl(re.sub(r'^Numbering note:\s*', 'Numbering note: ', note), T)] if note else [], T)
    secs = []
    toc = []
    for s in doc['secs']:
        so, sid = sec_open(T, s['num'], s['name'])
        body = RENDER[s['name']](s)
        secs.append(so + body + '</section>')
        toc.append((sid, s['name'], []))
    return toc_html(T, 'Product Spec', toc), head + ''.join(secs)
