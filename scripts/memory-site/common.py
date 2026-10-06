"""Shared pieces for the Clarivi Memory site: icons, generic renderers, page frame bits."""
import re
from mdlib import esc, inl, plain, slug, split_label, split_date, DEFAULT_CHIP

ICON = {
    'x': '<svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    'chev': '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'check14': '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'check13': '<svg class="ic" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'flask': '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3.5h6M10 3.5v6L5 18.5a1.4 1.4 0 0 0 1.2 2h11.6a1.4 1.4 0 0 0 1.2-2L14 9.5v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    'lock': '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    'ext16': '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M10 6H6a1.5 1.5 0 0 0-1.5 1.5v10.5A1.5 1.5 0 0 0 6 19.5h10.5A1.5 1.5 0 0 0 18 18v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'ext14': '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M10 6H6a1.5 1.5 0 0 0-1.5 1.5v10.5A1.5 1.5 0 0 0 6 19.5h10.5A1.5 1.5 0 0 0 18 18v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'warn': '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/></svg>',
}

CANVAS_URL = 'https://claude.ai/artifact/Xc7im7cUsqwwkDbyQRYt8E'

MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'


def list_html(lst, tab, cls='list'):
    tag = 'ol' if lst.get('ordered') else 'ul'
    out = [f'<{tag} class="{cls}">']
    for it in lst['items']:
        out.append('<li>' + inl(it['text'], tab) + blocks_html(it['blocks'], tab, nested=True) + '</li>')
    out.append(f'</{tag}>')
    return ''.join(out)


def table_html(t, tab):
    out = ['<div class="tbl-wrap"><table class="tbl"><thead><tr>']
    out += [f'<th>{inl(h, tab)}</th>' for h in t['head']]
    out.append('</tr></thead><tbody>')
    for r in t['rows']:
        out.append('<tr>' + ''.join(f'<td>{inl(c, tab)}</td>' for c in r) + '</tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)


def blocks_html(blocks, tab, nested=False):
    out = []
    for b in blocks:
        t = b['t']
        if t == 'p':
            out.append(f'<p class="li-extra">{inl(b["text"], tab)}</p>' if nested else f'<p>{inl(b["text"], tab)}</p>')
        elif t == 'list':
            out.append(list_html(b, tab))
        elif t == 'table':
            out.append(table_html(b, tab))
        elif t == 'quote':
            out.append(f'<div class="callout info small">{inl(b["text"], tab)}</div>')
        elif t == 'code':
            out.append(f'<pre class="codeblock">{esc(b["text"])}</pre>')
        elif t == 'h':
            out.append(f'<h4 class="sub-title">{inl(b["text"], tab)}</h4>')
    return ''.join(out)


def all_labelled(items):
    return items and all(split_label(it['text'])[2] == ':' for it in items)


def kv_html(items, tab):
    out = ['<div class="kv-list">']
    for it in items:
        lab, rest, _ = split_label(it['text'])
        out.append(f'<div class="kv"><div class="kv-k">{inl(lab, tab)}</div><div class="kv-v">{inl(rest, tab)}'
                   f'{blocks_html(it["blocks"], tab, nested=True)}</div></div>')
    out.append('</div>')
    return ''.join(out)


def notes_html(lst, tab):
    """A list whose items all start with '**Label:**' becomes a label/value list."""
    if all_labelled(lst['items']):
        return kv_html(lst['items'], tab)
    return list_html(lst, tab)


def details(summary_html, body_html, cls='built', open_=False):
    o = ' open' if open_ else ''
    body_cls = {'built': 'built-body', 'log': 'log-body', 'more': 'more-body'}[cls]
    return f'<details class="{cls}"{o}><summary>{summary_html}</summary><div class="{body_cls}">{body_html}</div></details>'


def status_chip(text):
    """'Agreed, v1.0 (30 September 2026)' -> (word, version, date)."""
    m = re.match(r'(\w+),\s*(v[\d.]+)\s*\(([^)]+)\)', text or '')
    if m:
        return m.group(1), m.group(2), m.group(3)
    return text, '', ''


def last_updated_html(text, tab):
    """'5 October 2026 (long list of changes)' -> date and a fold for the changes."""
    m = re.match(r'(\d{1,2} \w+ \d{4})\s*\((.*)\)\.?\s*$', text or '', re.S)
    if not m:
        return inl(text or '', tab)
    return (f'{esc(m.group(1))}' + details('What changed', f'<p>{inl(m.group(2), tab)}</p>', 'more'))


def doc_head(eyebrow, fname, title, sub, status, rows, notes, tab):
    word, ver, date = status_chip(status) if status else ('', '', '')
    out = ['<header class="doc-head">',
           f'<div class="eyebrow">{esc(eyebrow)} · <span class="mono">{esc(fname)}</span></div>',
           f'<h1 class="doc-title">{esc(title)}</h1>']
    if sub:
        out.append(f'<p class="doc-sub">{esc(sub)}</p>')
    if word:
        pill = 'good' if word.lower() == 'agreed' else 'neutral'
        out.append(f'<div class="doc-status"><span class="pill {pill}">{esc(word)}</span>'
                   f'<span class="doc-ver">{esc(ver)} · {esc(date)}</span></div>')
    if rows:
        out.append('<dl class="meta">')
        for k, v in rows:
            out.append(f'<div class="meta-row"><dt>{esc(k)}</dt><dd>{v}</dd></div>')
        out.append('</dl>')
    for n in notes:
        out.append(f'<div class="callout info small">{n}</div>')
    out.append('</header>')
    return ''.join(out)


def sec_open(tab, num, name, cls='sec', sid=None):
    sid = sid or f'{tab}-{slug(name)}'
    n = f'<span class="sec-num">{esc(num)}</span>' if num else ''
    return (f'<section class="{cls}" id="{sid}" aria-labelledby="h-{sid}"><div class="sec-head">{n}'
            f'<h2 id="h-{sid}">{esc(name)}</h2></div>'), sid


def sub_head(title, note='', key='', chip=''):
    k = f'<span class="mono sub-key">{esc(key)}</span> ' if key else ''
    n = f'<span class="muted small">{note}</span>' if note else ''
    return f'<div class="sub-head"><h3 class="sub-title">{k}{title}</h3>{chip}{n}</div>'


def paren_note(title):
    """'Decisions (all 29 September 2026 unless noted)' -> ('Decisions', 'All 29 ...')."""
    m = re.match(r'(.*?)\s*\((.+)\)\s*$', title)
    if m:
        note = m.group(2)
        return m.group(1), note[0].upper() + note[1:]
    return title, ''


def dec_rows(table, tab):
    out = ['<div class="card decisions">']
    for row in table['rows']:
        topic, date = split_date(row[0])
        chip = f'<span class="chip date">{esc(date)}</span>' if date else ''
        out.append(f'<div class="dec"><div class="dec-topic">{inl(topic, tab)}{chip}</div>'
                   f'<div class="dec-text">{inl(row[1], tab)}</div></div>')
    out.append('</div>')
    return ''.join(out)


def oq_cards(lst, tab):
    out = ['<div class="oq-list">']
    for i, it in enumerate(lst['items'], 1):
        lab, rest, _ = split_label(it['text'])
        body = ''
        m = re.match(r'Settled (\d{1,2} \w+ \d{4})(?: \(see Decisions\))?:?\s*(.*)', rest)
        if m:
            body = (f'<span class="chip st done">Settled</span> <span class="muted small">{esc(m.group(1))}</span> '
                    + inl(m.group(2), tab))
        else:
            body = inl(rest, tab)
        sub = ''
        if it['blocks']:
            for b in it['blocks']:
                if b['t'] == 'list':
                    sub += notes_html(b, tab)
                else:
                    sub += blocks_html([b], tab)
        p = f'<p>{body}</p>' if rest.strip() else ''
        out.append(f'<div class="oq card"><span class="oq-num">{i}</span><div class="oq-body">'
                   f'<h4>{inl(lab or "", tab)}</h4>{p}{sub}</div></div>')
    out.append('</div>')
    return ''.join(out)


def toc_html(tab, label, entries):
    """entries: list of (id, text, children[(id, text)])."""
    out = [f'<nav class="toc" aria-label="On this page: {esc(label)}"><div class="toc-t">On this page</div><ul>']
    for sid, text, kids in entries:
        out.append(f'<li><a href="#{sid}" data-toc="{sid}">{esc(text)}</a>')
        if kids:
            out.append('<ul>' + ''.join(f'<li><a href="#{k}" data-toc="{k}">{esc(t)}</a></li>' for k, t in kids) + '</ul>')
        out.append('</li>')
    out.append('</ul></nav>')
    return ''.join(out)


def figs(h):
    for pat in [r'at least 26 of 28 days', r'at least 90%', r'No tolerance', r'Absolute, no tolerance',
                r'(?<=at least )2 in 3', r'about 1 day in 7', r'at least 5 days a week',
                r'about half the time or more']:
        h = re.sub(pat, lambda m: f'<b class="fig">{m.group(0)}</b>', h, count=1)
    return h


HL_PHRASES = ['shown once and stored only as a SHA-256 hash', 'A configured Shortcut is never shared',
              'So the full-access values live only in Supabase', 'The repository holds no secrets',
              'Row-level security on every table']


def hl_list(lst, tab):
    out = ['<ul class="list">']
    for it in lst['items']:
        cls = ' class="hl"' if any(p in it['text'] for p in HL_PHRASES) else ''
        out.append(f'<li{cls}>' + inl(it['text'], tab) + blocks_html(it['blocks'], tab, nested=True) + '</li>')
    out.append('</ul>')
    return ''.join(out)


def plan_blocks(blocks, tab):
    """Generic rendering for notes in the plan and elsewhere: a bold label alone followed by a
    list becomes a fold; a bold-label paragraph becomes a callout; tables become label/value cards."""
    out = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b['t'] == 'p':
            lab, rest, punct = split_label(b['text'])
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            if lab and not rest.strip() and nxt and nxt['t'] in ('list', 'table'):
                body = list_html(nxt, tab) if nxt['t'] == 'list' else table_html(nxt, tab)
                out.append(details(inl(lab, tab), body, 'built'))
                i += 2
                continue
            if lab:
                out.append(f'<div class="callout info small"><strong>{inl(lab, tab)}{punct or "."}</strong> {inl(rest, tab)}</div>')
            else:
                out.append(f'<p class="muted small">{inl(b["text"], tab)}</p>')
        elif b['t'] == 'list':
            out.append(f'<div class="card">{list_html(b, tab)}</div>')
        elif b['t'] == 'table':
            out.append(table_html(b, tab))
        else:
            out.append(blocks_html([b], tab))
        i += 1
    return ''.join(out)
