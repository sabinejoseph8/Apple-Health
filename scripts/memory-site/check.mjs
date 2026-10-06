// Check the built Memory site in WebKit at desktop and phone widths, light and dark:
// no page error, nothing wider than the screen, and (with Mermaid) every diagram drawn.
//   node scripts/memory-site/check.mjs [private/memory-site/test.html]
import { webkit } from '@playwright/test';
import path from 'path';

const file = path.resolve(process.argv[2] || 'private/memory-site/test.html');
const browser = await webkit.launch();
let failed = 0;
for (const [w, h] of [[1280, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + file);
    await page.waitForFunction(() => document.body.dataset.mer, null, { timeout: 60000 });
    const mer = await page.evaluate(() => document.body.dataset.mer);
    const problems = [...errors];
    if (mer.startsWith('error')) problems.push('diagrams: ' + mer);
    for (const tab of ['product', 'design', 'tech', 'plan', 'mvp']) {
      await page.evaluate((t) => { location.hash = t; }, tab);
      await page.waitForTimeout(300);
      const r = await page.evaluate((t) => {
        const d = document.documentElement;
        const drawn = [...document.querySelectorAll('#' + t + ' pre.mermaid')].filter((p) => !p.querySelector('svg')).length;
        return { over: d.scrollWidth - d.clientWidth, undrawn: drawn };
      }, tab);
      if (r.over > 0) problems.push(`${tab}: ${r.over}px wider than the screen`);
      if (mer === 'done' && r.undrawn) problems.push(`${tab}: ${r.undrawn} diagram(s) not drawn`);
    }
    const plan = await page.evaluate(() => document.getElementById('all-count').textContent);
    console.log(`${w} ${scheme}: ${problems.length ? 'PROBLEMS ' + JSON.stringify(problems) : 'ok'} (${plan}; diagrams ${mer})`);
    failed += problems.length;
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
