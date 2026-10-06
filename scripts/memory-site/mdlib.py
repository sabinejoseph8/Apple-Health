"""Markdown helpers for the Clarivi Memory site: block parsing and inline rendering."""
import html
import re
from markdown_it import MarkdownIt

_md = MarkdownIt('commonmark', {'html': False})

DEFAULT_CHIP = '<span class="chip chip-default" title="A proposed starting point">Default</span>'

FILE_TABS = {
    'product-spec.md': 'product',
    'design.md': 'design',
    'tech-spec.md': 'tech',
    'progress.md': 'plan',
    'mvp.md': 'mvp',
}


def esc(s):
    return html.escape(s, quote=True)


def slug(s, n=48):
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'[`*]', '', s).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:n].rstrip('-')


def plain(s):
    """Markdown inline to plain text."""
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', s)
    s = s.replace('`', '')
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


# ---------- inline ----------

def _link_text(t, tab):
    """Add cross-links inside a plain text run (already HTML-escaped)."""
    def rlink(m):
        n = int(m.group(1))
        if tab == 'mvp':
            if 1 <= n <= 26:
                return f'<a class="rref" href="#mvp-R{n}">R{n}</a>'
            return m.group(0)
        if 1 <= n <= 67:
            return f'<a class="rref" href="#R{n}">R{n}</a>'
        return m.group(0)

    def dlink(m):
        n = int(m.group(1))
        if 1 <= n <= 85:
            return f'<a class="rref" href="#D{n}">D{n}</a>'
        return m.group(0)

    def alink(m):
        n = int(m.group(1))
        if 1 <= n <= 11:
            return f'<a class="rref" href="#A{n}">A{n}</a>'
        return m.group(0)

    t = re.sub(r'(?<![\w#/-])R(\d{1,2})(?![\w])', rlink, t)
    t = re.sub(r'(?<![\w#/-])D(\d{1,2})(?![\w])', dlink, t)
    if tab == 'mvp':
        t = re.sub(r'(?<![\w#/-])A(\d{1,2})(?![\w])', alink, t)
    for fname, target in FILE_TABS.items():
        t = re.sub(r'(?<![\w/.-])' + re.escape(fname) + r'(?![\w])',
                   f'<a class="docref" href="#{target}">{fname}</a>', t)
    # Default markers written without bold
    t = re.sub(r'(?<![\w])Default:\s*', DEFAULT_CHIP + ' ', t)
    t = re.sub(r'(?<![\w])Default(?=\))', DEFAULT_CHIP, t)
    return t


def inl(text, tab='', links=True):
    h = _md.renderInline(text)
    h = h.replace('<strong>Default:</strong> ', DEFAULT_CHIP + ' ')
    h = h.replace('<strong>Default:</strong>', DEFAULT_CHIP + ' ')
    h = h.replace('<strong>Default</strong>', DEFAULT_CHIP)
    if not links:
        return h
    out = []
    depth_code = depth_a = 0
    for part in re.split(r'(<[^>]+>)', h):
        if part.startswith('<'):
            tag = part[1:].split()[0].rstrip('>').lower() if len(part) > 2 else ''
            if tag == 'code':
                depth_code += 1
            elif tag == '/code':
                depth_code -= 1
            elif tag == 'a':
                depth_a += 1
            elif tag == '/a':
                depth_a -= 1
            elif tag == 'span' and 'chip' in part:
                pass
            out.append(part)
        else:
            if depth_code or depth_a or not part:
                out.append(part)
            else:
                out.append(_link_text(part, tab))
    return ''.join(out)


# ---------- blocks ----------

ITEM_RE = re.compile(r'(-|\d+\.)\s+(.*)')


def _starts_block(line):
    s = line.lstrip()
    return (s.startswith('|') or s.startswith('#') or s.startswith('>') or s.startswith('```')
            or bool(ITEM_RE.match(s)) or s.startswith('---'))


def _split_row(row):
    row = row.strip()
    if row.startswith('|'):
        row = row[1:]
    if row.endswith('|'):
        row = row[:-1]
    cells, buf, in_code = [], '', False
    for ch in row:
        if ch == '`':
            in_code = not in_code
        if ch == '|' and not in_code:
            cells.append(buf.strip())
            buf = ''
        else:
            buf += ch
    cells.append(buf.strip())
    return cells


def _dedent(lines):
    ind = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
    return [l[ind:] if l.strip() else '' for l in lines]


def parse_list(lines, i):
    first = lines[i]
    base = len(first) - len(first.lstrip())
    ordered = bool(re.match(r'\d+\.', first.lstrip()))
    items = []
    while i < len(lines):
        l = lines[i]
        if not l.strip():
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                nl = lines[j]
                nind = len(nl) - len(nl.lstrip())
                if items and (nind > base or (nind == base and ITEM_RE.match(nl.lstrip()))):
                    if nind > base:
                        items[-1]['raw'].append('')
                    i = j
                    continue
            break
        s = l.lstrip()
        ind = len(l) - len(s)
        m = ITEM_RE.match(s)
        if ind == base and m:
            items.append({'marker': m.group(1), 'text': m.group(2), 'raw': []})
            i += 1
            continue
        if ind > base and items:
            items[-1]['raw'].append(l)
            i += 1
            continue
        break
    for it in items:
        it['blocks'] = parse_blocks(_dedent(it['raw'])) if it['raw'] else []
        del it['raw']
    return {'ordered': ordered, 'items': items}, i


def parse_blocks(lines):
    blocks = []
    i = 0
    while i < len(lines):
        l = lines[i]
        if not l.strip():
            i += 1
            continue
        s = l.lstrip()
        if s.startswith('```'):
            j = i + 1
            buf = []
            while j < len(lines) and not lines[j].lstrip().startswith('```'):
                buf.append(lines[j])
                j += 1
            blocks.append({'t': 'code', 'text': '\n'.join(buf)})
            i = j + 1
            continue
        if s.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                rows.append(lines[i])
                i += 1
            cells = [_split_row(r) for r in rows]
            head = cells[0]
            body = [c for c in cells[1:] if not all(re.fullmatch(r':?-{2,}:?', x) for x in c)]
            blocks.append({'t': 'table', 'head': head, 'rows': body})
            continue
        if ITEM_RE.match(s):
            lst, i = parse_list(lines, i)
            lst['t'] = 'list'
            blocks.append(lst)
            continue
        if s.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].lstrip().startswith('>'):
                buf.append(lines[i].lstrip()[1:].strip())
                i += 1
            blocks.append({'t': 'quote', 'text': ' '.join(buf)})
            continue
        if s.startswith('#'):
            m = re.match(r'(#+)\s+(.*)', s)
            blocks.append({'t': 'h', 'level': len(m.group(1)), 'text': m.group(2).strip()})
            i += 1
            continue
        if s.startswith('---'):
            i += 1
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not (buf and _starts_block(lines[i])):
            buf.append(lines[i].strip())
            i += 1
        blocks.append({'t': 'p', 'text': ' '.join(buf), 'lines': buf})
    return blocks


# ---------- documents ----------

def load_doc(path):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    title = ''
    head = []
    secs = []
    cur = None
    for l in lines:
        if l.startswith('# ') and not title:
            title = l[2:].strip()
            continue
        if l.startswith('## '):
            cur = {'title': l[3:].strip(), 'lines': []}
            secs.append(cur)
            continue
        if cur is None:
            head.append(l)
        else:
            cur['lines'].append(l)
    meta = {}
    extra = []
    for l in head:
        m = re.match(r'\*\*([^*]+?):\*\*\s*(.*)', l.strip())
        if m:
            meta[m.group(1)] = m.group(2)
        elif l.strip() and l.strip() != '---':
            extra.append(l)
    for s in secs:
        m = re.match(r'(\d+)\.\s+(.*)', s['title'])
        s['num'] = m.group(1) if m else ''
        s['name'] = m.group(2) if m else s['title']
        s['blocks'] = parse_blocks(s['lines'])
        # split into ### subsections
        subs = []
        pre = []
        cur = None
        for b in s['blocks']:
            if b['t'] == 'h' and b['level'] == 3:
                cur = {'title': b['text'], 'blocks': []}
                subs.append(cur)
            elif cur is None:
                pre.append(b)
            else:
                cur['blocks'].append(b)
        s['pre'] = pre
        s['subs'] = subs
    return {'title': title, 'meta': meta, 'extra': extra, 'secs': secs}


def split_label(text):
    """'**Label:** rest' -> ('Label', 'rest', ':'), else (None, text, '')."""
    m = re.match(r'\*\*(.+?)\*\*\s*(.*)$', text)
    if not m:
        return None, text, ''
    lab = m.group(1).strip()
    rest = m.group(2)
    punct = ''
    if lab.endswith(':') or lab.endswith('.'):
        punct = lab[-1]
        lab = lab[:-1].strip()
    elif rest.startswith(':'):
        punct = ':'
        rest = rest[1:].lstrip()
    return lab, rest, punct


def split_date(head):
    """'Topic (3 Oct 2026)' -> ('Topic', '3 Oct 2026')."""
    m = re.match(r'(.*?)\s*\((\d{1,2} \w{3,9} \d{4})\)\s*$', head)
    if m:
        return m.group(1), m.group(2)
    return head, ''
