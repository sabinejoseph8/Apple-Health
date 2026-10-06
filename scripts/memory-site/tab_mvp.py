"""MVP tab (mvp.md): scope, success criteria, risks and the decision register (D1 onwards)."""
import re
from mdlib import esc, inl, plain, slug, split_label
from common import (ICON, blocks_html, list_html, notes_html, sec_open, sub_head, toc_html, doc_head,
                    last_updated_html, details, kv_html, figs)

T = 'mvp'

NAMES = {
    'How to Use This Document': 'How to use this document',
    'The Core Value the MVP Must Prove': 'The core value the MVP must prove',
    'Proposed Must-Haves (the thin slice)': 'Must-haves (the thin slice)',
    'Proposed Out of Scope for the MVP': 'Out of scope for the MVP',
    'Future Features the Architecture Should Support Now': 'Future features the architecture supports now',
    'Investigate Before Building': 'Investigate before building',
    'Decisions You Still Need to Make': 'Decisions',
    'Clarifying Questions and Answers': 'Clarifying questions and answers',
    'Suggested Sequence (investigation, not building)': 'Suggested sequence (investigation, not building)',
}


def p_or(b):
    return f'<p>{inl(b["text"], T)}</p>' if b['t'] == 'p' else blocks_html([b], T)


def how_to(sec):
    return ''.join(f'<div class="callout muted-box">{inl(b["text"], T)}</div>' for b in sec['blocks'] if b['t'] == 'p')


def core(sec):
    out = []
    for b in sec['pre']:
        if b['t'] == 'p' and b['text'].startswith('**Core value'):
            rest = split_label(b['text'])[1]
            first, _, after = rest.partition('; this tool explains them.')
            out.append('<div class="ov-grid"><figure class="value-quote"><div class="eyebrow">core value in one sentence</div>'
                       f'<blockquote>{inl(first + "; this tool explains them.", T)}</blockquote>'
                       f'<figcaption>{inl(after.strip(), T)}</figcaption></figure></div>')
        elif b['t'] == 'list':
            out.append('<div class="tiles">' + ''.join(
                f'<div class="tile"><div class="tile-t">{inl(split_label(it["text"])[0], T)}</div>'
                f'<p>{inl(split_label(it["text"])[1][:1].upper() + split_label(it["text"])[1][1:], T)}</p></div>'
                for it in b['items']) + '</div>')
        else:
            out.append(f'<p class="{"muted small" if b["text"].startswith("Anything") else ""}" style="margin-top:12px">{inl(b["text"], T)}</p>')
    for sub in sec['subs']:
        title, _, note = sub['title'].partition(': ')
        out.append('<div class="sub-block" style="margin-top:24px">' + sub_head(inl(title, T), esc(note[:1].upper() + note[1:])))
        for b in sub['blocks']:
            if b['t'] == 'list':
                out.append('<div class="tiles tiles-3">' + ''.join(
                    f'<div class="tile"><div class="tile-t">{inl(split_label(it["text"])[0], T)}</div>'
                    f'<p>{figs(inl(split_label(it["text"])[1], T))}</p></div>' for it in b['items']) + '</div>')
            else:
                out.append(p_or(b))
        out.append('</div>')
    return ''.join(out)


def label_cards(lst, masonry=True):
    cards = []
    for it in lst['items']:
        lab, rest, _ = split_label(it['text'])
        cards.append(f'<div class="card"><h3 class="card-title small">{inl(lab, T)}</h3><p>{inl(rest[:1].upper() + rest[1:], T)}</p>'
                     f'{blocks_html(it["blocks"], T)}</div>')
    return f'<div class="grid2{" masonry" if masonry else ""}">' + ''.join(cards) + '</div>'


def must(sec):
    out = []
    for b in sec['pre']:
        out.append(label_cards(b) if b['t'] == 'list' else p_or(b))
    for sub in sec['subs']:
        title, _, note = sub['title'].partition(': ')
        out.append('<div class="sub-block" style="margin-top:24px">' + sub_head(inl(title, T), esc(note[:1].upper() + note[1:])))
        for b in sub['blocks']:
            out.append(label_cards(b) if b['t'] == 'list' else p_or(b))
        out.append('</div>')
    return ''.join(out)


def out_of_scope(sec):
    out = [p_or(b) for b in sec['pre']]
    out.append('<div class="grid2">')
    for sub in sec['subs']:
        items = ''.join(f'<li>{ICON["x"]}<span>{inl(it["text"], T)}</span></li>'
                        for b in sub['blocks'] if b['t'] == 'list' for it in b['items'])
        out.append(f'<div class="card"><h3 class="card-title small">{inl(sub["title"], T)}</h3><ul class="x-list" style="columns:1">{items}</ul></div>')
    out.append('</div>')
    return ''.join(out)


def future(sec):
    out = []
    for b in sec['blocks']:
        if b['t'] == 'list':
            out.append('<div class="parts">' + ''.join(
                f'<div class="pattern card"><h4>{inl(split_label(it["text"])[0], T)}</h4>'
                f'<p>{inl(split_label(it["text"])[1][:1].upper() + split_label(it["text"])[1][1:], T)}</p></div>'
                for it in b['items']) + '</div>')
        else:
            out.append(p_or(b))
    return ''.join(out)


def investigate(sec):
    out = []
    for sub in sec['subs']:
        out.append('<div class="sub-block" style="margin-top:24px">' + sub_head(inl(sub['title'], T)))
        for b in sub['blocks']:
            if b['t'] == 'list' and sub['title'].startswith('Product assumptions'):
                rows = []
                for it in sorted(b['items'], key=lambda it: int(re.match(r'\*\*A(\d+)', it['text']).group(1))):
                    m = re.match(r'\*\*A(\d+)\*\*\s*(.*)$', it['text'])
                    n, rest = m.group(1), m.group(2)
                    rows.append(f'<div class="arow" id="A{n}"><a class="rid" href="#A{n}" aria-label="Assumption A{n}">A{n}</a>'
                                f'<div>{inl(rest, T)}</div></div>')
                out.append(f'<div class="card dreg">{"".join(rows)}</div>')
            elif b['t'] == 'list':
                out.append(f'<div class="card">{notes_html(b, T)}</div>')
            elif b['t'] == 'table':
                rows = sorted(b['rows'], key=lambda r: int(re.match(r'R(\d+)', r[0]).group(1)))
                out.append('<div class="risks">')
                for r in rows:
                    m = re.match(r'R(\d+)\s+(.*)$', r[0])
                    n, title = m.group(1), m.group(2)
                    out.append(f'<article class="risk card" id="mvp-R{n}"><div class="risk-head"><h4>{inl(title, T)}</h4>'
                               f'<span class="chip phase">R{n}</span></div><dl class="risk-dl"><dt>Why it matters</dt><dd>{inl(r[1], T)}</dd>'
                               f'<dt>How to de-risk</dt><dd>{inl(r[2], T)}</dd></dl></article>')
                out.append('</div>')
            else:
                out.append(f'<div class="card">{p_or(b)}</div>')
        out.append('</div>')
    return ''.join(out)


def _state_chip(state):
    s = state.strip()
    low = s.lower()
    cls = 'gone' if low.startswith('withdrawn') or low.startswith('superseded') else ('prog' if low.startswith('revised') else 'done')
    text = s[:1].upper() + s[1:].lower()
    text = re.sub(r'\bd(\d+)\b', r'D\1', text)
    return f'<span class="chip st {cls}">{inl(text, T)}</span>'


def decisions(sec):
    subs = {s['title']: s for s in sec['subs']}
    full = {}
    callouts = []
    for b in subs['Decided so far']['blocks']:
        if b['t'] != 'list':
            continue
        for it in b['items']:
            m = re.match(r'\*\*D(\d+)\*\*\s*(.*)$', it['text'])
            if m:
                full[int(m.group(1))] = m.group(2)
            else:
                lab, rest, _ = split_label(it['text'])
                callouts.append((lab, rest))
    rows = {}
    options_record = {}
    intro = ''
    for b in subs['Open']['blocks']:
        if b['t'] == 'p':
            intro = b['text']
        if b['t'] != 'table':
            continue
        for r in b['rows']:
            m = re.match(r'D(\d+)\s*(.*)$', r[0])
            n, rest = int(m.group(1)), m.group(2).strip()
            if rest.startswith('(record'):
                options_record[n] = (r[1], r[2])
                continue
            state = ''
            if rest.endswith(')'):
                k = rest.rfind(' (')
                state, rest = rest[k + 2:-1], rest[:k]
            rows[n] = (rest, state, r[1], r[2])
    out = []
    if intro:
        out.append(f'<p>{inl(intro, T)}</p>')
    for lab, rest in callouts:
        out.append(f'<div class="callout warn">{ICON["warn"]}<span><strong>{inl(lab, T)}.</strong> {inl(rest, T)}</span></div>')
    nums = sorted(set(rows) | set(full))
    out.append('<div class="filter"><label for="dec-filter" class="sr">Filter decisions</label>'
               '<input id="dec-filter" type="search" placeholder="Filter, for example consent, D81 or notification" autocomplete="off">'
               f'<span class="filter-count" id="dec-count" aria-live="polite">{len(nums)} decisions</span></div>'
               '<p class="empty" id="dec-empty" hidden>No decision matches that. Try a shorter word.</p>')
    regs = []
    for n in nums:
        title, state, pick, changes = rows.get(n, ('', '', '', ''))
        if not title:
            title = plain(full.get(n, ''))[:80]
        chip = _state_chip(state) if state else ''
        body = ''
        if pick:
            body += f'<p class="drow-pick">{inl(pick, T)}</p>'
        if changes:
            body += f'<p class="drow-why"><span class="muted">What it changes:</span> {inl(changes, T)}</p>'
        more = ''
        if n in full:
            more += f'<p>{inl(full[n], T)}</p>'
        if n in options_record:
            o, c = options_record[n]
            more += f'<p><strong>Options considered.</strong> {inl(o, T)}</p><p>{inl(c, T)}</p>'
        if more:
            body += details('The full record', more, 'more')
        regs.append(f'<div class="drow" id="D{n}"><a class="rid" href="#D{n}" aria-label="Decision D{n}">D{n}</a>'
                    f'<div><div class="drow-head"><span class="drow-title">{inl(title, T)}</span>{chip}</div>{body}</div></div>')
    out.append(f'<div class="card dreg">{"".join(regs)}</div>')
    for key in ('Reversal and its consequences', 'Confirmed: score and composite inputs'):
        if key in subs:
            txt = ' '.join(b['text'] for b in subs[key]['blocks'] if b['t'] == 'p')
            out.append(f'<div class="callout muted-box"><strong>{esc(key)}.</strong> {inl(txt, T)}</div>')
    return ''.join(out)


def questions(sec):
    out = []
    for b in sec['blocks']:
        if b['t'] == 'p':
            out.append(f'<p class="muted">{inl(b["text"], T)}</p>')
        elif b['t'] == 'list':
            out.append('<div class="oq-list">')
            for i, it in enumerate(b['items'], 1):
                m = re.match(r'(.*?)\s*\*\*([^*]+?):\*\*\s*(.*)$', it['text'])
                q, lab, ans = (m.group(1), m.group(2), m.group(3)) if m else (it['text'], '', '')
                a = f'<p><span class="chip st done">{esc(lab)}</span> {inl(ans, T)}</p>' if lab else ''
                out.append(f'<div class="oq card"><span class="oq-num">{i}</span><div class="oq-body"><h4>{inl(q, T)}</h4>{a}</div></div>')
            out.append('</div>')
    return ''.join(out)


def sequence(sec):
    out = []
    for b in sec['blocks']:
        lab, rest, _ = split_label(b['text']) if b['t'] == 'p' else (None, '', '')
        if lab:
            out.append(f'<div class="callout info small"><strong>{inl(lab, T)}:</strong> {inl(rest, T)}</div>')
        else:
            out.append(f'<div class="card">{p_or(b)}</div>')
    return ''.join(out)


RENDER = {
    'How to Use This Document': how_to, 'The Core Value the MVP Must Prove': core,
    'Proposed Must-Haves (the thin slice)': must, 'Proposed Out of Scope for the MVP': out_of_scope,
    'Future Features the Architecture Should Support Now': future, 'Investigate Before Building': investigate,
    'Decisions You Still Need to Make': decisions, 'Clarifying Questions and Answers': questions,
    'Suggested Sequence (investigation, not building)': sequence,
}


def build(doc):
    m = doc['meta']
    sub_line = next((l.strip() for l in doc['extra'] if '|' in l), '')
    parts = [p.strip() for p in sub_line.split('|')]
    rows = [('Last updated', last_updated_html(m.get('Last updated'), T)),
            ('Owner', esc(parts[2] if len(parts) > 2 else 'Sabine Joseph')),
            ('Project', esc(parts[1] if len(parts) > 1 else ''))]
    fn = m.get('Format note', '')
    notes = [inl('**Format note.** ' + fn[:1].upper() + fn[1:], T)] if fn else []
    notes.append('Risk numbers here (R1 to R26) are the MVP\'s own and link within this tab; elsewhere on the site, R-numbers are '
                 'the product spec\'s requirements. Decision numbers (D1 onwards) link here from every tab.')
    head = ('<header class="doc-head"><div class="eyebrow">MVP · <span class="mono">mvp.md</span></div>'
            '<h1 class="doc-title">Clarivi MVP</h1>'
            f'<p class="doc-sub">{esc(parts[0] if parts else "")}</p>'
            '<div class="doc-status"><span class="pill neutral">Kept up to date</span>'
            '<span class="doc-ver">Every scoping decision made · D1 to D85</span></div><dl class="meta">'
            + ''.join(f'<div class="meta-row"><dt>{esc(k)}</dt><dd>{v}</dd></div>' for k, v in rows) + '</dl>'
            + ''.join(f'<div class="callout info small">{n}</div>' for n in notes) + '</header>')
    toc, body = [], []
    num = 0
    for s in doc['secs']:
        name = NAMES.get(s['name'], s['name'])
        so, sid = sec_open(T, s['num'], name)
        body.append(so + RENDER[s['name']](s) + '</section>')
        toc.append((sid, name, []))
    return toc_html(T, 'MVP', toc), head + ''.join(body)
