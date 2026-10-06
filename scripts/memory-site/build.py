"""Build the Clarivi Memory site from the five project memory files in docs/.

    .venv/bin/python scripts/memory-site/build.py [--out private/memory-site] [--ticks DIR] [--mermaid PATH]

Writes, in --out (default private/memory-site, which git ignores):
  index.html  the page to publish to https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe
  test.html   a local copy for checking (check.mjs): a stand-in tick store and, with --mermaid,
              a local Mermaid so the diagrams draw
and updates assets/task-ids.json, so every task keeps its id (and its tick) on the next build.

--ticks: a folder of the site's saved ticks (ArtifactData list with out_dir), used to match tasks
whose words changed and to show ticks in test.html.
"""
import argparse
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from mdlib import load_doc, esc  # noqa: E402
from taskids import known_ids, save_ids  # noqa: E402
import tab_product, tab_design, tab_tech, tab_plan, tab_mvp  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(ROOT, 'private', 'memory-site'))
ap.add_argument('--ticks', default=None)
ap.add_argument('--mermaid', default=None, help='path to mermaid.min.js for test.html')
ap.add_argument('--keep-ids', action='store_true', help='do not update assets/task-ids.json')
args = ap.parse_args()

A = os.path.join(HERE, 'assets')
DOCS = os.path.join(ROOT, 'docs')


def read(name):
    return open(os.path.join(A, name), encoding='utf-8').read()


assets = {
    'visual': read('design-visual.html'),
    'previews': json.loads(read('previews.json')),
    'mermaid': json.loads(read('mermaid.json')),
}
css, js = read('site.css'), read('site.js')

ids_json = os.path.join(A, 'task-ids.json')
known = known_ids(ids_json, args.ticks)

product = load_doc(os.path.join(DOCS, 'product-spec.md'))
plan_toc, plan_body, tasks = tab_plan.build(load_doc(os.path.join(DOCS, 'progress.md')), known)
tabs = [
    ('product', 'Product Spec', 'Product', tab_product.build(product)),
    ('design', 'Design Spec', 'Design', tab_design.build(load_doc(os.path.join(DOCS, 'design.md')), assets)),
    ('tech', 'Tech Spec', 'Tech', tab_tech.build(load_doc(os.path.join(DOCS, 'tech-spec.md')), assets)),
    ('plan', 'Plan', 'Plan', (plan_toc, plan_body)),
    ('mvp', 'MVP', 'MVP', tab_mvp.build(load_doc(os.path.join(DOCS, 'mvp.md')))),
]

tabbar = ['<div class="tabbar"><nav class="tabs" role="tablist" aria-label="Project Memory files">']
for i, (k, lng, sht, _) in enumerate(tabs):
    tabbar.append(f'<a role="tab" class="tab" id="tab-{k}" href="#{k}" aria-controls="{k}" '
                  f'aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}">'
                  f'<span class="t-long">{lng}</span><span class="t-short">{sht}</span></a>')
tabbar.append('</nav></div>')

panels = ['<main class="panels" id="panels">']
for i, (k, lng, sht, (toc, body)) in enumerate(tabs):
    on = ' on' if i == 0 else ''
    hidden = '' if i == 0 else ' aria-hidden="true" inert'
    panels.append(f'<section class="panel{on}" id="{k}" role="tabpanel" aria-labelledby="tab-{k}"{hidden}>'
                  f'<div class="panel-grid">{toc}<div class="doc">{body}</div></div></section>')
panels.append('</main>')

m = re.match(r'(\w+),\s*(v[\d.]+)\s*\(([^)]+)\)', product['meta'].get('Status', ''))
version = f'{m.group(2)} · {m.group(3)}' if m else ''
today = datetime.date.today()
refreshed = f'{today.day} {today.strftime("%B")} {today.year}'
header = ('<header class="site-head"><div class="sh-inner"><div class="eyebrow">Project Memory · 5 files</div>'
          '<div class="sh-title">Clarivi</div><p class="sh-lede">Apple Watch records the numbers; this tool explains them.</p>'
          '<div class="sh-meta"><span class="pill good">Specs and plan agreed</span>'
          f'<span>{esc(version)}</span><span>Owner: Sabine Joseph</span><span>Refreshed {refreshed}</span></div></div></header>')
footer = ('<footer class="site-foot">Built from the five Project Memory files in <span class="mono">docs/</span>: '
          '<span class="mono">product-spec.md</span>, <span class="mono">design.md</span>, <span class="mono">tech-spec.md</span>, '
          '<span class="mono">progress.md</span> and <span class="mono">mvp.md</span>, by '
          '<span class="mono">scripts/memory-site/build.py</span>. Plan ticks are stored with this page.</footer>')

page = '<div class="app">' + header + ''.join(tabbar) + ''.join(panels) + footer + '</div>'
head = ('<title>Clarivi Memory</title>\n'
        '<meta name="description" content="Product, design and tech specs, the build plan and the MVP decisions for Clarivi">\n')
out = head + '<style>' + css + '</style>\n' + page + '\n<script>' + js + '</script>\n'

os.makedirs(args.out, exist_ok=True)
open(os.path.join(args.out, 'index.html'), 'w', encoding='utf-8').write(out)

# Local test copy: a stand-in for the page's tick store, and Mermaid if given.
ticks = {}
if args.ticks and os.path.isdir(args.ticks):
    for f in os.listdir(args.ticks):
        if f.endswith('.json'):
            ticks[f[:-5]] = json.load(open(os.path.join(args.ticks, f), encoding='utf-8'))
mock = ('<script>window.claude={use:async function(n){if(n==="user")return{canEdit:async()=>false};'
        'if(n==="db"){const T=' + json.dumps(ticks) + ';return{collection:()=>({limit:()=>({onSnapshot:(cb)=>{setTimeout(()=>cb({docs:'
        'Object.keys(T).map(k=>({id:k,exists:true,data:()=>T[k]}))}),10);}})}),doc:()=>({set:async()=>{},update:async()=>{}})};}'
        'throw new Error("no")}};</script>\n')
if args.mermaid:
    mer = (f'<script src="file://{esc(os.path.abspath(args.mermaid))}"></script><script>mermaid.initialize({{startOnLoad:false}});'
           'window.addEventListener("load",()=>mermaid.run({querySelector:"pre.mermaid"}).then(()=>{document.body.dataset.mer="done"})'
           '.catch(e=>{document.body.dataset.mer="error:"+e.message}));</script>')
else:
    mer = '<script>window.addEventListener("load",()=>{document.body.dataset.mer="skipped"});</script>'
test = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + mock + head + '</head><body><style>' + css + '</style>\n' + page + '\n<script>' + js + '</script>\n' + mer + '</body></html>')
open(os.path.join(args.out, 'test.html'), 'w', encoding='utf-8').write(test)

if not args.keep_ids:
    save_ids(ids_json, tasks, known)

new = [t for t in tasks if t['matched'] == 'new']
done = sum(1 for t in tasks if t['done'])
print(f'Built {os.path.join(args.out, "index.html")} ({len(out):,} bytes): {len(tasks)} tasks, {done} marked done in progress.md.')
for t in new:
    print(f'  new task id {t["id"]}: {t["main_text"][:80]}')
gone = sorted(set(known) - {t['id'] for t in tasks})
for g in gone:
    print(f'  id no longer in the plan: {g} (delete its tick if it has one)')
