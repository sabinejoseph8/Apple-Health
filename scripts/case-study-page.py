"""Build the case study as a readable web page (for the Artifact tool) from docs/case-study.html.

    python3 scripts/case-study-page.py [--out private/case-study-page/index.html]

The words and numbers stay in docs/case-study.html, which also makes the PDF. This script
reads that file, puts the architecture diagram in as a drawing instead of an image, and wraps it in
a page that works at phone width and in light and dark. Publish the result to the page's own address;
When the case study changes, update docs/case-study.html first and run this again. Standard library only.
"""
import argparse
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS = """
  /* Layout: one reading column on a phone, the PDF's two columns from 860px. Colours are the case study's own. */
  :root {
    --bg: #FFFFFF; --ink: #1F2430; --muted: #5B6170; --line: #D9DDE5; --mist: #F3F5F8;
    --brand: #1F3A5F; --accent: #2A9D8F; --warm: #B5491F; --yes: #1F7A4D;
    --note: #FFF8E6; --note-edge: #E5B53C;
    --sans: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #10151D; --ink: #E6E9EF; --muted: #A3ACBA; --line: #2B3442; --mist: #18202B;
      --brand: #A9C2E6; --accent: #4CC3B3; --warm: #F29467; --yes: #5DD39E;
      --note: #2A2314; --note-edge: #C79A2E; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #10151D; --ink: #E6E9EF; --muted: #A3ACBA; --line: #2B3442; --mist: #18202B;
    --brand: #A9C2E6; --accent: #4CC3B3; --warm: #F29467; --yes: #5DD39E;
    --note: #2A2314; --note-edge: #C79A2E; color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.55;
         padding-block: 28px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .page { max-width: 980px; margin: 0 auto; }
  h1, h2 { color: var(--brand); margin: 0; line-height: 1.2; text-wrap: balance; }
  .head { border-left: 6px solid var(--brand); padding: 2px 0 2px 16px; margin-bottom: 22px; }
  .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--warm); margin-bottom: 8px; }
  h1 { font-size: clamp(34px, 7vw, 48px); }
  .sub { font-size: clamp(18px, 3.4vw, 22px); font-weight: 600; color: var(--brand); margin: 6px 0 12px; }
  .lede { margin: 0; max-width: 68ch; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0 0 30px; }
  .kpi { background: var(--mist); border-top: 3px solid var(--accent); border-radius: 4px; padding: 12px 14px; min-width: 0; }
  .kpi.miss { border-top-color: var(--warm); }
  .kpi b { display: block; font-size: 26px; color: var(--brand); line-height: 1.1; font-variant-numeric: tabular-nums; }
  .kpi span { display: block; font-size: 13px; color: var(--muted); margin-top: 6px; line-height: 1.4; }
  .cols { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); gap: 36px; }
  .cols > div { min-width: 0; }
  h2 { font-size: 19px; padding-bottom: 5px; border-bottom: 2px solid var(--brand); margin: 0 0 10px; }
  section { margin-bottom: 26px; }
  p { margin: 0 0 10px; }
  ul { margin: 0; padding-left: 20px; }
  li { margin: 0 0 7px; }
  strong { color: var(--brand); }
  .figure { border: 1px solid var(--line); border-radius: 6px; padding: 10px; margin: 0 0 30px; min-width: 0; }
  .figure .hint { display: none; font-size: 13px; color: var(--muted); margin-top: 6px; }
  .diagram { overflow-x: auto; border-radius: 4px; background: #FFFFFF; }
  .diagram svg { display: block; width: 100%; min-width: 640px; height: auto; }
  .figure .cap { font-size: 13px; color: var(--muted); margin-top: 8px; }
  .scroll { overflow-x: auto; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 700; }
  td.no { color: var(--warm); font-weight: 700; }
  td.yes { color: var(--yes); font-weight: 700; }
  .note { background: var(--note); border-left: 4px solid var(--note-edge); padding: 12px 14px; font-size: 15px; margin: 4px 0 8px; }
  .problem { max-width: 82ch; }
  .problem > p { margin-bottom: 12px; }
  .status { background: var(--note); border-left: 4px solid var(--note-edge); padding: 12px 16px; margin: 0 0 22px; max-width: 76ch; }
  .status strong { color: var(--ink); }
  .foot { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 16px; font-size: 14px; color: var(--muted); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 32px; }
  .foot strong { color: var(--ink); }
  .more { margin-top: 18px; font-size: 15px; display: flex; flex-wrap: wrap; gap: 8px 20px; }
  .more a { color: var(--brand); font-weight: 600; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 859px) {
    .cols { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 700px) {
    .figure .hint { display: block; }
  }
  @media (max-width: 560px) {
    .foot { grid-template-columns: minmax(0, 1fr); }
  }
"""

# The same words as the README's note at the top. Rewrite both together.
STATUS = ('<strong>Project in progress.</strong> Two test weeks are done, both with an iPhone Shortcut doing the sync. '
          'Week one (19 to 25 October 2026) missed the sync target (4 of 7 days against 6); week two (2 to 8 November) met it '
          '(6 of 7). Both times the calculations matched an independent check on my whole year, with 0 values different. '
          'Since 10 November 2026 the sync is a native iPhone app that reads Health on its own; its mornings are not counted yet.')

LINKS = [
    ('The repository', 'https://github.com/sabinejoseph8/Apple-Health'),
    ('Evaluation', 'https://github.com/sabinejoseph8/Apple-Health/blob/main/docs/evaluation.md'),
    ('Try the demo on made-up data', 'https://apple-health-rust.vercel.app'),
    ('Project memory', 'https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe'),
    ('PDF version', 'https://github.com/sabinejoseph8/Apple-Health/blob/main/docs/case-study.pdf'),
]


def between(text, start, end):
    i = text.index(start)
    return text[i:text.index(end, i)]


def build():
    src = open(os.path.join(ROOT, 'docs', 'case-study.html'), encoding='utf-8').read()
    body = between(src, '<body>', '</body>')[len('<body>'):]
    head = between(body, '<header class="head">', '</header>') + '</header>'
    problem = between(body, '<section class="problem">', '</section>') + '</section>'
    kpis = between(body, '<div class="kpis">', '<div class="figure">').rstrip()
    figure = re.search(r'<div class="figure">.*?<div class="cap">.*?</div>\s*</div>', body, flags=re.S).group(0)
    cols = between(body, '<div class="cols">', '<footer').rstrip()
    foot = between(body, '<footer class="foot">', '</footer>') + '</footer>'

    svg = open(os.path.join(ROOT, 'docs', 'architecture.svg'), encoding='utf-8').read().strip()
    svg = re.sub(r'<\?xml[^>]*\?>\s*', '', svg)
    img = '<img src="architecture.png" alt="Architecture diagram">'
    assert img in figure, 'the architecture image tag moved in docs/case-study.html'
    figure = figure.replace(img, '<div class="diagram">' + svg + '</div>')
    figure = figure.replace('<div class="cap">', '<div class="hint">Swipe sideways to see the whole drawing.</div><div class="cap">', 1)
    cols = re.sub(r'(<table>.*?</table>)', r'<div class="scroll">\1</div>', cols, flags=re.S)
    links = '<nav class="more" aria-label="More">' + ''.join(f'<a href="{u}">{t}</a>' for t, u in LINKS) + '</nav>'

    title = re.search(r'<title>(.*?)</title>', src).group(1)
    return (f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{CSS}</style>\n'
            f'<div class="page">\n{head}\n<p class="status" role="note">{STATUS}</p>\n{problem}\n{kpis}\n{figure}\n{cols}\n{foot}\n{links}\n</div>\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'private', 'case-study-page', 'index.html'))
    args = ap.parse_args()
    html = build()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    open(args.out, 'w', encoding='utf-8').write(html)
    print(f'Wrote {args.out} ({len(html):,} bytes)')
