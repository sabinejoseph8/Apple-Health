"""Tech Spec tab. The diagrams are kept in assets/mermaid.json; everything else comes from tech-spec.md."""
import re
from mdlib import esc, inl, plain, slug, split_label
from common import (ICON, blocks_html, list_html, notes_html, sec_open, sub_head, paren_note, dec_rows, oq_cards,
                    toc_html, doc_head, last_updated_html, details, all_labelled, kv_html, hl_list)

T = 'tech'


def figure(init, src, label, caption, dmin=None):
    sc = f' scrolls" style="--dmin:{dmin}px' if dmin else ''
    hint = '<p class="diagram-hint">Swipe sideways to see the whole diagram.</p>' if dmin else ''
    return (f'<figure class="diagram-fig"><div class="diagram{sc}" role="img" aria-label="{esc(label)}">'
            f'<pre class="mermaid">{esc(init + chr(10) + src)}</pre></div>{hint}<figcaption>{inl(caption, T)}</figcaption></figure>')


def architecture(sec, ctx):
    init, mer = ctx['init'], ctx['mer']
    out = []
    for b in sec['blocks']:
        if b['t'] == 'p' and not b['text'].startswith('**'):
            out.append(f'<p>{inl(b["text"], T)}</p>')
    out.append(figure(init, mer['architecture'], 'Architecture: Shortcut to ingest function to raw readings, analysis queue and '
                      'analysis to results, outbox and push sender to the web app',
                      'Readings flow in, results are worked out on the server, and the app reads them back.', 560))
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    out.append('<h3 class="sub-title">Main parts</h3><div class="parts">')
    for i, it in enumerate(lst['items'], 1):
        m = re.match(r'\*\*(.+?)\*\*\s*(.*)$', it['text'])
        title, extra = (m.group(1), m.group(2)) if m else (it['text'], '')
        ex = f'<p>{inl(extra, T)}</p>' if extra else ''
        out.append(f'<div class="part card"><div class="part-head"><span class="part-num">{i}</span><h4>{inl(title, T)}</h4></div>'
                   f'{ex}{blocks_html(it["blocks"], T)}</div>')
    out.append('</div>')
    out.append('<h3 class="sub-title">A normal morning, step by step</h3>')
    out.append(figure(init, mer['sequence'], 'Sequence of a normal morning: the Shortcut pings and posts, the database builds the '
                      'status every minute and queues the notification, the sender pushes it, and the app reads its own rows',
                      'One morning: the Shortcut posts, the every-minute job builds the status and queues the notification, '
                      'and the sender delivers it.', 640))
    return ''.join(out)


def choices(sec, ctx):
    t = next(b for b in sec['blocks'] if b['t'] == 'table')
    out = ['<div class="card choices">']
    for r in t['rows']:
        out.append(f'<div class="choice"><div class="choice-area">{inl(r[0], T)}</div><div class="choice-main">'
                   f'<div class="choice-pick">{inl(r[1], T)}</div><div class="choice-why">{inl(r[2], T)}</div></div></div>')
    out.append('</div>')
    return ''.join(out)


def dt_card(table):
    rows = ''.join(f'<div class="dt-row"><div class="dt-name">{inl(r[0], T)}</div><div class="dt-holds">{inl(r[1], T)}</div>'
                   f'<div class="dt-fields">{inl(r[2], T)}</div></div>' for r in table['rows'])
    return f'<div class="card dt">{rows}</div>'


def data_model(sec, ctx):
    init, mer = ctx['init'], ctx['mer']
    blocks = sec['blocks']
    out = []
    first = blocks[0]
    out.append(f'<div class="callout info">{ICON["lock"]}<span>{inl(first["text"], T)}</span></div>')
    pipeline = mer['pipeline']
    out.append('<h3 class="sub-title">How a night becomes a status</h3>')
    out.append(figure(init, pipeline, 'Data flow from samples to nights, baselines, daily status, insights, notifications and digests',
                      'Results are always rebuilt from raw readings; the queue runs the analysis every minute.'))
    ers = [
        ('er1', 'Accounts and raw data', mer['er_accounts'], 'Entity diagram for accounts and raw data',
         'Every table carries `user_id`; uploads are signed by an upload token and contain the raw samples.', 600),
        ('er2', 'Results', mer['er_results'], 'Entity diagram for results',
         'Results are keyed by user and date, and each daily status records the settings version it used.', 600),
        ('er3', 'Answers and consent', mer['er_answers'], 'Entity diagram for consent, check-ins, follow-through and notifications',
         'Answers hang off the user and the day; notifications are unique per user, date and kind; each consent records the text\'s version.', 600),
        ('er4', 'Logs and owner', mer['er_logs'], 'Entity diagram for usage events, events, the analysis queue and experiments',
         'Usage logs never hold health values; `experiments` is the empty register kept for the causal layer.', 560),
    ]
    out.append('<h3 class="sub-title">How the tables connect</h3><div class="er-tabs" role="tablist" aria-label="Data model diagrams">')
    for i, (eid, lab, *_r) in enumerate(ers):
        on = ' on' if i == 0 else ''
        out.append(f'<button type="button" role="tab" class="er-tab{on}" aria-selected="{"true" if i == 0 else "false"}" data-er="{eid}">{esc(lab)}</button>')
    out.append('</div><div class="er-panels">')
    for i, (eid, lab, src, aria, cap, dmin) in enumerate(ers):
        on = ' on' if i == 0 else ''
        out.append(f'<div class="er-panel{on}" id="{eid}">' + figure(init, src, aria, cap, dmin) + '</div>')
    out.append('</div><p class="muted small">Key fields only. Field types are indicative; the tables below list every key field.</p>')
    out.append('<h3 class="sub-title">Tables</h3>')
    # groups
    i = 1
    group_open = False
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p':
            text = b['text']
            m = re.match(r'\*\*([^*]+)\*\*\s*(\((.+)\))?\s*$', text)
            if m:
                if group_open:
                    out.append('</div>')
                note = f' <span class="muted small">({esc(m.group(3))})</span>' if m.group(3) else ''
                out.append(f'<div class="dt-group"><h4 class="dt-title">{esc(m.group(1))}{note}</h4>')
                group_open = True
                i += 1
                continue
            bm = re.match(r'(Built in .+?):\s*$', text)
            if bm and i + 1 < len(blocks) and blocks[i + 1]['t'] == 'list':
                out.append(details(esc(bm.group(1)), list_html(blocks[i + 1], T), 'built'))
                i += 2
                continue
            out.append(f'<div class="callout info small">{inl(text, T)}</div>')
        elif b['t'] == 'table':
            out.append(dt_card(b))
        elif b['t'] == 'list':
            for it in b['items']:
                lab, rest, _ = split_label(it['text'])
                if lab:
                    pm = re.match(r'\((.+?)\):\s*(.*)$', rest)
                    holds, fields = (pm.group(1), pm.group(2)) if pm else ('', rest)
                    out.append(f'<div class="card dt"><div class="dt-row"><div class="dt-name">{inl(lab, T)}</div>'
                               f'<div class="dt-holds">{inl(holds, T)}</div><div class="dt-fields">{inl(fields, T)}</div></div></div>')
                else:
                    out.append(f'<div class="card">{list_html({"items": [it]}, T)}</div>')
        i += 1
    if group_open:
        out.append('</div>')
    return ''.join(out)


def iface_body(blocks):
    out = []
    for b in blocks:
        if b['t'] == 'list':
            out.append(notes_html(b, T))
        elif b['t'] == 'p':
            out.append(f'<p>{inl(b["text"], T)}</p>')
        else:
            out.append(blocks_html([b], T))
    h = ''.join(out)
    # POST /path -> endpoint chip
    h = re.sub(r'<code>POST (/[^<]+)</code>', r'<span class="endpoint"><span class="method">POST</span><code>\1</code></span>', h)
    return h


def interfaces(sec, ctx):
    out = ['<div class="ifaces">']
    for sub in sec['subs']:
        out.append(f'<div class="card iface"><h3 class="card-title">{inl(sub["title"], T)}</h3>{iface_body(sub["blocks"])}</div>')
    out.append('</div>')
    return ''.join(out)


def patterns(sec, ctx):
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    out = ['<div class="parts">']
    for i, it in enumerate(lst['items'], 1):
        lab, rest, _ = split_label(it['text'])
        body = f'<p>{inl(rest, T)}</p>' if rest.strip() else ''
        out.append(f'<div class="pattern card"><div class="part-head"><span class="part-num">{i}</span><h4>{inl(lab, T)}</h4></div>'
                   f'{body}{blocks_html(it["blocks"], T)}</div>')
    out.append('</div>')
    return ''.join(out)


def security(sec, ctx):
    out = ['<div class="grid2 masonry">']
    blocks = sec['blocks']
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p' and b['text'].startswith('**'):
            lab = split_label(b['text'])[0]
            body = ''
            if i + 1 < len(blocks) and blocks[i + 1]['t'] == 'list':
                body = hl_list(blocks[i + 1], T)
                i += 1
            out.append(f'<div class="card"><h3 class="card-title">{inl(lab, T)}</h3>{body}</div>')
        else:
            out.append(blocks_html([b], T))
        i += 1
    out.append('</div>')
    return ''.join(out)


def hosting(sec, ctx):
    out = []
    blocks = sec['blocks']
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p' and b['text'].startswith('**Environments'):
            lab = split_label(b['text'])[0]
            title, note = (lab.split(' (', 1) + [''])[:2]
            out.append('<div class="sub-block">' + sub_head(esc(title), esc(note.rstrip(')')[:1].upper() + note.rstrip(')')[1:])))
            t = blocks[i + 1]
            out.append('<div class="grid2">')
            for r in t['rows']:
                rows = ''.join(f'<div class="meta-row"><dt>{esc(t["head"][j])}</dt><dd>{inl(r[j], T)}</dd></div>' for j in range(1, len(r)))
                out.append(f'<div class="card env"><h4 class="env-name">{inl(r[0], T)}</h4><dl class="meta stacked">{rows}</dl></div>')
            out.append('</div>')
            if i + 2 < len(blocks) and blocks[i + 2]['t'] == 'list':
                out.append(f'<div class="card">{list_html(blocks[i + 2], T)}</div>')
                i += 1
            out.append('</div>')
            i += 2
            continue
        if b['t'] == 'p' and b['text'].startswith('**Deployment'):
            out.append('<div class="sub-block">' + sub_head('Deployment'))
            lst = blocks[i + 1]
            out.append('<ol class="steps">' + ''.join(
                f'<li><span class="step-n">{n}</span><p>{inl(it["text"], T)}</p></li>' for n, it in enumerate(lst['items'], 1)) + '</ol>')
            i += 2
            while i < len(blocks) and blocks[i]['t'] == 'p' and not blocks[i]['text'].startswith('**'):
                out.append(f'<p class="muted small" style="margin-top:10px">{inl(blocks[i]["text"], T)}</p>')
                i += 1
            out.append('</div>')
            continue
        if b['t'] == 'p' and b['text'].startswith('**Configuration'):
            out.append('<div class="sub-block">' + sub_head('Configuration') + '<div class="cfg">')
            lst = blocks[i + 1]
            for it in lst['items']:
                lab, rest, _ = split_label(it['text'])
                sub = ''.join(list_html(x, T, 'list tight') if x['t'] == 'list' else blocks_html([x], T) for x in it['blocks'])
                r = f'<p>{inl(rest, T)}</p>' if rest.strip() else ''
                out.append(f'<div class="cfg-group"><div class="cfg-k">{inl(lab, T)}</div>{r}{sub}</div>')
            out.append('</div></div>')
            i += 2
            continue
        out.append(blocks_html([b], T))
        i += 1
    return ''.join(out)


def testing(sec, ctx):
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    out = ['<div class="grid2 masonry">']
    for it in lst['items']:
        lab, rest, _ = split_label(it['text'])
        body = f'<p>{inl(rest, T)}</p>' if rest.strip() else ''
        out.append(f'<div class="card test-card"><h3 class="card-title">{ICON["flask"]} {inl(lab, T)}</h3>{body}'
                   f'{blocks_html(it["blocks"], T)}</div>')
    out.append('</div>')
    return ''.join(out)


def risks(sec, ctx):
    out = []
    t = None
    for b in sec['blocks']:
        if b['t'] == 'p':
            out.append(f'<p class="muted">{inl(b["text"], T)}</p>')
        elif b['t'] == 'table':
            t = b
    rows = sorted(t['rows'], key=lambda r: int(r[3]))
    counts = {}
    for r in rows:
        counts[r[3]] = counts.get(r[3], 0) + 1
    chips = [f'<button type="button" class="fchip on" data-phase="all" aria-pressed="true">All <span>{len(rows)}</span></button>']
    for ph in sorted(counts, key=int):
        chips.append(f'<button type="button" class="fchip" data-phase="{ph}" aria-pressed="false">Phase {ph} <span>{counts[ph]}</span></button>')
    out.append('<div class="seg-filter" role="group" aria-label="Filter risks by phase">' + ''.join(chips) + '</div><div class="risks">')
    for r in rows:
        out.append(f'<article class="risk card" data-phase="{r[3]}"><div class="risk-head"><h4>{inl(r[0], T)}</h4>'
                   f'<span class="chip phase">Phase {r[3]}</span></div><dl class="risk-dl"><dt>Why it matters</dt><dd>{inl(r[1], T)}</dd>'
                   f'<dt>How to handle</dt><dd>{inl(r[2], T)}</dd></dl></article>')
    out.append('</div>')
    return ''.join(out)


def decisions(sec, ctx):
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
    'Architecture overview': architecture, 'Technology choices': choices, 'Data model': data_model,
    'Interfaces between parts': interfaces, 'System patterns (secure and extensible)': patterns,
    'Security': security, 'Hosting, deployment and configuration': hosting, 'Testing approach': testing,
    'Critical risks and challenges': risks, 'Decisions and open questions': decisions,
}


def build(doc, assets):
    ctx = {'init': assets['mermaid']['init'], 'mer': assets['mermaid']}
    m = doc['meta']
    note = next((l.strip() for l in doc['extra'] if 'Requirement numbers' in l), '')
    head = doc_head('Tech Spec', 'tech-spec.md', 'Tech Spec', 'Clarivi', m.get('Status'),
                    [('Last updated', last_updated_html(m.get('Last updated'), T)),
                     ('Builds on', inl(m.get('Builds on', ''), T)), ('Builder', inl(m.get('Builder', ''), T))],
                    [inl(note, T)] if note else [], T)
    toc, body = [], []
    for s in doc['secs']:
        so, sid = sec_open(T, s['num'], s['name'])
        body.append(so + RENDER[s['name']](s, ctx) + '</section>')
        toc.append((sid, s['name'], []))
    return toc_html(T, 'Tech Spec', toc), head + ''.join(body)
