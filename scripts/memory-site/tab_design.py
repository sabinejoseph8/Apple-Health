"""Design Spec tab. The drawn palette, type, spacing and radius section and each component's
drawn preview are kept in assets/ (design-visual.html, previews.json; drawn once from the
design canvas's sample day, in the app's current words). Every other text comes from design.md,
including each colour's "used for" line, which is refreshed on every build."""
import re
from mdlib import esc, inl, plain, slug, split_label
from common import (ICON, CANVAS_URL, blocks_html, list_html, notes_html, sec_open, sub_head, toc_html,
                    doc_head, last_updated_html, all_labelled, kv_html)

T = 'design'

def principles(sec):
    lst = next(b for b in sec['blocks'] if b['t'] == 'list')
    out = ['<div class="principles">']
    for it in lst['items']:
        lab, rest, _ = split_label(it['text'])
        out.append(f'<div class="principle"><h3>{inl(lab, T)}</h3><p>{inl(rest, T)}</p></div>')
    out.append('</div>')
    return ''.join(out)


def visual(sec, assets):
    """The kept drawn section, with each swatch's 'used for' line refreshed from the tables."""
    h = assets['visual'].strip()
    for sub in sec['subs']:
        if sub['title'] != 'Colour palette':
            continue
        for b in sub['blocks']:
            if b['t'] != 'table' or b['head'][0] != 'Name':
                continue
            for name, _hex, used in b['rows']:
                pat = re.compile(r'(<div class="sw-name">' + re.escape(esc(name).replace('&#x27;', "'")) +
                                 r'</div>.*?<p class="sw-use">)(.*?)(</p>)', re.S)
                h, n = pat.subn(lambda m: m.group(1) + inl(used, T) + m.group(3), h, count=1)
                if not n:
                    raise SystemExit(f'swatch not found: {name}')
    h = h.replace('<section class="sec" id="design-visual-design-language" aria-labelledby="h-design-visual-design-language">', '', 1)
    h = re.sub(r'^<div class="sec-head">.*?</div>', '', h, count=1, flags=re.S)
    return h[:-len('</section>')]


def comp_blocks(sec):
    comps = []
    cur = None
    for b in sec['blocks']:
        if b['t'] == 'p' and b['text'].startswith('**'):
            m = re.match(r'\*\*(.+?)\*\*\s*(.*)$', b['text'])
            name, after = m.group(1), m.group(2)
            default = False
            lead = ''
            ctx = ''
            if name.endswith(':'):
                name = name[:-1]
                lead = after
            nm = re.match(r'(.*?)\s*\(Default\)$', name)
            if nm:
                name, default = nm.group(1), True
            cm = re.match(r'\((.+?)\)\s*$', after)
            if cm and not lead:
                ctx = cm.group(1)
            elif after and not lead:
                lead = after
            cur = {'name': name, 'default': default, 'ctx': ctx, 'lead': lead, 'blocks': []}
            comps.append(cur)
        elif cur:
            cur['blocks'].append(b)
    return comps


def components(sec, assets):
    previews = assets['previews']
    out = ['<p class="muted small">Previews are drawn in the app\'s light colours with the sample day\'s content, '
           'in the words the app uses now ("usual range", D85).</p><div class="comps">']
    for c in comp_blocks(sec):
        cid = 'comp-' + slug(c['name'])
        if cid not in previews:
            raise SystemExit(f'No drawn preview for {cid}: add one to assets/previews.json')
        well = previews[cid]
        chip = '<span class="chip chip-default" title="A proposed starting point">Default</span>' if c['default'] else ''
        ctx = f'<span class="comp-ctx">{inl(c["ctx"], T)}</span>' if c['ctx'] else ''
        notes = ''
        if c['lead']:
            notes += f'<p class="comp-lead">{inl(c["lead"], T)}</p>'
        for b in c['blocks']:
            notes += notes_html(b, T) if b['t'] == 'list' else blocks_html([b], T)
        out.append(f'<article class="card comp" id="{cid}"><div class="comp-head"><h3>{inl(c["name"], T)}</h3>{chip}</div>'
                   f'{ctx}{well}<div class="comp-notes">{notes}</div></article>')
    out.append('</div>')
    return ''.join(out)


def screens(sec):
    out = []
    blocks = sec['blocks']
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'table':
            rows = ''.join(f'<div class="screen-row"><div><div class="screen-name">{inl(r[0], T)}</div>'
                           f'<div class="muted small">{inl(r[1], T)}</div></div><div class="screen-where">{inl(r[2], T)}</div></div>'
                           for r in b['rows'])
            out.append(f'<div class="card screens">{rows}<a class="ext-btn" href="{CANVAS_URL}" target="_blank" rel="noopener">'
                       f'{ICON["ext16"]} Open the Clarivi Screens canvas</a></div>')
        elif b['t'] == 'p':
            lab, rest, _ = split_label(b['text'])
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            if lab and lab.startswith('Sample data'):
                out.append(f'<div class="callout ease"><strong>{inl(lab, T)}.</strong> {inl(rest, T)}</div>')
            elif lab and lab.startswith('Not designed yet') and nxt and nxt['t'] == 'list':
                head, _, note = lab.partition(';')
                out.append(f'<h3 class="sub-title">{esc(head)}</h3><p class="muted small">{esc(note.strip().capitalize())}</p>')
                out.append('<div class="chips-wrap">' + ''.join(
                    f'<span class="chip big">{inl(it["text"], T)}</span>' for it in nxt['items']) + '</div>')
                i += 1
            elif lab and lab.startswith('As built') and nxt and nxt['t'] == 'list':
                head, _, note = lab.partition(', on the')
                out.append('<h3 class="sub-title">As built</h3>'
                           f'<p class="muted small">{inl(lab, T)}; the rows for later phases say which phase.</p>')
                out.append('<div class="card">' + (kv_html(nxt['items'], T) if all_labelled(nxt['items']) else list_html(nxt, T)) + '</div>')
                i += 1
            elif lab and lab.startswith('Earlier options') and nxt and nxt['t'] == 'list':
                out.append(f'<div class="callout muted-box"><strong>{inl(lab, T)}</strong>{list_html(nxt, T)}</div>')
                i += 1
            else:
                out.append(f'<p>{inl(b["text"], T)}</p>')
        else:
            out.append(blocks_html([b], T))
        i += 1
    return ''.join(out)


def build(doc, assets):
    m = doc['meta']
    designed = m.get('Designed screens', '')
    rows = [('Designed screens', inl(designed, T) + f' <a class="ext" href="{CANVAS_URL}" target="_blank" rel="noopener">'
             f'Open the canvas {ICON["ext14"]}</a>'),
            ('Look', inl(m.get('Look', ''), T)),
            ('Last updated', last_updated_html(m.get('Last updated'), T))]
    note = next((l.strip() for l in doc['extra'] if 'Default' in l), '')
    head = doc_head('Design Spec', 'design.md', 'Design', 'Clarivi', m.get('Status'), rows,
                    [inl(note, T)] if note else [], T)
    toc = []
    body = []
    for s in doc['secs']:
        so, sid = sec_open(T, s['num'], s['name'])
        kids = []
        if s['name'] == 'Design principles':
            h = principles(s)
        elif s['name'] == 'Visual design language':
            h = visual(s, assets)
            kids = [(f'design-{slug(re.sub(r" [(].*", "", x["title"]))}', re.sub(r' \(.*', '', x['title'])) for x in s['subs']]
        elif s['name'] == 'Main UI components':
            h = components(s, assets)
        elif s['name'] == 'Screens':
            h = screens(s)
        else:
            raise SystemExit('unknown design section ' + s['name'])
        body.append(so + h + '</section>')
        toc.append((sid, s['name'], kids))
    return toc_html(T, 'Design Spec', toc), head + ''.join(body)
