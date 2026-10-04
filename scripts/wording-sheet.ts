// Prints an HTML sample sheet of the app's words for every card state, using
// made-up days, so the wording can be reviewed before the screens use it.
//   node scripts/wording-sheet.ts > sheet.html
// Nothing here reads real data.

import {
  alsoChecked,
  briefing,
  type DayWords,
  formatDuration,
  headline,
  learningLastNight,
  morningNotification,
  whySummary,
} from '../supabase/functions/_shared/briefing.ts'
import { wording as w } from '../supabase/functions/_shared/wording.ts'
import { notCounted, reading, type SampleDay, sampleDay } from '../src/lib/sample-days.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const normal = {
  hrv: reading('hrv', 52, 52, 6),
  sleep: reading('sleep', 430, 430, 34),
  sleeping_hr: reading('sleeping_hr', 50, 50, 2.5),
}
const day = (status: SampleDay['status'], nudge: SampleDay['nudge'], points: Partial<SampleDay['points']>, extra: Partial<SampleDay> = {}): SampleDay => {
  const all = { ...normal, ...points }
  const used = Object.values(all).filter((p) => p.counted).length
  return { status, nudge, total: null, readings_used: used, reason_codes: [], composite_fired: false, points: all, ...extra }
}

const statusDays: { title: string; note: string; day: SampleDay }[] = [
  { title: "The design's sample day", note: 'HRV 38 (normal 52), sleep 5h 52m (normal 7h 10m), sleeping heart rate 51 (normal 50).', day: sampleDay },
  { title: 'A normal night', note: 'Everything at normal.', day: day('ready', 'train_as_planned', {}) },
  {
    title: 'Small differences, still Ready',
    note: 'Sleep and HRV a little below normal, inside the range.',
    day: day('ready', 'train_as_planned', { sleep: reading('sleep', 390, 430, 34), hrv: reading('hrv', 44, 52, 6) }),
  },
  {
    title: 'A short night, but Ready',
    note: 'Sleep outside the range, the rest normal. The case to watch in your self-test.',
    day: day('ready', 'train_as_planned', { sleep: reading('sleep', 340, 430, 34) }, { reason_codes: ['sleep_outside_range'] }),
  },
  {
    title: 'A very short night',
    note: 'Sleep earns the most points, so the nudge is prioritise sleep.',
    day: day('ease_off', 'prioritise_sleep', { sleep: reading('sleep', 250, 430, 34) }, { reason_codes: ['sleep_outside_range'] }),
  },
  {
    title: 'HRV well below normal',
    note: 'HRV outside the range, the rest normal.',
    day: day('ease_off', 'train_easy', { hrv: reading('hrv', 34, 52, 6) }, { reason_codes: ['hrv_outside_range'] }),
  },
  {
    title: 'Sleeping heart rate up',
    note: 'Sleeping heart rate outside the range, HRV a little low.',
    day: day('ease_off', 'train_easy', { sleeping_hr: reading('sleeping_hr', 57, 50, 2.5), hrv: reading('hrv', 44, 52, 6) }, {
      reason_codes: ['sleeping_hr_outside_range', 'hrv_worse_than_normal'],
    }),
  },
  {
    title: 'Several small differences',
    note: 'All three a little off, none outside the range, adding up to Ease off.',
    day: day('ease_off', 'train_easy', {
      sleep: reading('sleep', 380, 430, 34),
      hrv: reading('hrv', 42, 52, 6),
      sleeping_hr: reading('sleeping_hr', 54, 50, 2.5),
    }, { reason_codes: ['hrv_worse_than_normal', 'sleeping_hr_worse_than_normal', 'sleep_worse_than_normal'] }),
  },
  {
    title: 'Rest, with the illness pattern',
    note: 'HRV far below and sleeping heart rate far above normal; several overnight readings moved together.',
    day: day('rest', 'rest', { hrv: reading('hrv', 30, 52, 6), sleeping_hr: reading('sleeping_hr', 58, 50, 2.5) }, {
      reason_codes: ['hrv_outside_range', 'sleeping_hr_outside_range'],
      composite_fired: true,
    }),
  },
  {
    title: 'HRV missing (2 of 3 readings)',
    note: "The sample day without HRV: 1.19 points, Ready under the final numbers.",
    day: day('ready', 'train_as_planned', { ...sampleDay.points, hrv: notCounted('missing') }, { reason_codes: ['sleep_outside_range'] }),
  },
  {
    title: 'HRV normal still being learned (2 of 3 readings)',
    note: 'Sleep short, so Ease off from the other two.',
    day: day('ease_off', 'prioritise_sleep', { hrv: notCounted('building', 45), sleep: reading('sleep', 300, 430, 34), sleeping_hr: reading('sleeping_hr', 51, 50, 2.5) }, {
      reason_codes: ['sleep_outside_range'],
    }),
  },
  {
    title: 'Better than normal',
    note: 'HRV above the range, the rest normal.',
    day: day('ready', 'train_as_planned', { hrv: reading('hrv', 66, 52, 6) }),
  },
  {
    title: "The illness check couldn't run",
    note: 'The sample day with too few readings for the check: no "early sign" words.',
    day: { ...sampleDay, composite_fired: null },
  },
]

function pill(text: string, kind: string) {
  return `<span class="pill ${kind}">${esc(text)}</span>`
}

function statusCard(d: DayWords & { nudge: SampleDay['nudge'] }) {
  if (d.status === 'none' || !d.nudge) return ''
  const n = w.card.nudges[d.nudge]
  const why = whySummary(d)
  return `
    <div class="phone">
      <div class="row">${pill(w.card.status[d.status], d.status)}<span class="muted">${esc(w.card.synced(w.time.at('6:42am')))}</span></div>
      ${d.readings_used === 2 ? `<div class="muted small">${esc(w.card.partial)}</div>` : ''}
      <h3>${esc(headline(d))}</h3>
      <p>${esc(briefing(d).join(' '))}</p>
      <div class="nudge"><div class="eyebrow ease">${esc(w.card.nudgeLabel)}</div><div class="action">${esc(n.action)}</div><div>${esc(n.detail)}</div></div>
      <div class="link">${esc(w.card.why[d.status])}</div>
    </div>
    <div class="side">
      <div class="eyebrow">Morning notification</div><p>${esc(morningNotification(d) ?? '')}</p>
      <div class="eyebrow">Why today: summary</div><p><b>${esc(why.headline)}</b></p><p>${esc(why.body.join(' '))}</p>
    </div>`
}

function stateCard(p: string, h: string, detail: string[], note = '') {
  return `<div class="pair"><div class="phone">
      <div class="row">${pill(p, 'neutral')}</div>
      <h3>${esc(h)}</h3>${detail.map((x) => `<p>${esc(x)}</p>`).join('')}
    </div><div class="side"><p class="muted">${esc(note)}</p></div></div>`
}

const s = w.states
const v2 = { ease: '1.2', rest: '2.4', window: 42, needed: 21 }
const decided = w.why.decided

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clarivi wording sheet</title>
<style>
  body{margin:0;background:#f2f2f7;color:#000;font:15px/1.5 -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif}
  main{max-width:900px;margin:0 auto;padding:24px 16px 60px}
  h1{font:700 32px/1.15 inherit;letter-spacing:-.01em;margin:0 0 6px} h2{font:700 22px/1.25 inherit;margin:40px 0 4px}
  h3{font:700 20px/1.25 inherit;margin:8px 0 6px} .lede{color:#3a3a3c;max-width:60ch}
  .pair{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:16px;margin:16px 0;align-items:start}
  @media (max-width:700px){.pair{grid-template-columns:1fr}}
  .phone{background:#fff;border-radius:18px;padding:18px 20px} .phone p{margin:0 0 8px;color:#3a3a3c}
  .side{font-size:14px;color:#3a3a3c} .side p{margin:2px 0 10px}
  .scenario{font:600 15px inherit;margin:28px 0 0} .scenario span{display:block;font-weight:400;color:#6c6c70;font-size:13px}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .pill{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font:600 13px inherit}
  .ready{color:#1f7a35;background:#e3f4e8} .ease_off{color:#8a4100;background:#ffebd6} .rest{color:#a1261d;background:#fde7e5} .neutral{color:#3a3a3c;background:#e5e5ea}
  .muted{color:#6c6c70} .small{font-size:13px;margin-top:6px}
  .nudge{background:#fff4e8;border-radius:14px;padding:12px 14px;margin:10px 0}
  .nudge .action{font:700 17px inherit} .eyebrow{font:600 12px inherit;letter-spacing:.04em;text-transform:uppercase;color:#6c6c70;margin-top:4px} .eyebrow.ease{color:#8a4100}
  .link{color:#0a60d8;border-top:1px solid #e5e5ea;padding-top:10px}
  table{border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;width:100%;margin-top:10px}
  td{padding:9px 14px;border-top:1px solid #e5e5ea;vertical-align:top} tr:first-child td{border-top:0} td:first-child{color:#6c6c70;width:34%}
  .buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
  .buttons span{background:#eef3fc;color:#0a4fb8;border-radius:12px;height:48px;display:grid;place-items:center;font:600 17px inherit}
</style></head><body><main>
<h1>Clarivi wording sheet</h1>
<p class="lede">Every sentence the new screens will show, on made-up days. This is for checking the words, not the layout: the screens themselves come next. The numbers on the right are only for context; the card's briefing never shows numbers.</p>

<h2>1. The card on days with a status</h2>
<p class="lede">The headline and briefing are built from rules: what was off, what it means, then what was normal and the illness check. At most three sentences.</p>
${statusDays.map((x) => `<div class="scenario">${esc(x.title)}<span>${esc(x.note)}</span></div><div class="pair">${statusCard(x.day)}</div>`).join('')}

<h2>2. Cards without a status, and notices</h2>
${stateCard(s.waiting.pill, s.waiting.headline, [s.waiting.lastSync('yesterday at 6:51am')], 'Before this morning’s sync arrives (R25). Yesterday’s status is never shown.')}
${stateCard(s.analysing.pill, s.analysing.headline, [s.analysing.detail], 'The sync has arrived and the server is still working out the status (usually under a minute).')}
${stateCard(s.analysing.pill, s.analysing.delayedHeadline, [s.analysing.delayedDetail], 'Still no status 15 minutes after the readings arrived.')}
${stateCard(s.nightUnfinished.pill, s.nightUnfinished.headline, [s.nightUnfinished.detail], 'A sync came before the Watch handed over last night’s sleep (R26). Before noon only.')}
${stateCard(s.missed.pill, s.missed.headline, [s.missed.detail], 'No sync by 11:30am (R27).')}
${stateCard(s.noSync.pill, s.noSync.headline, [s.noSync.detail], 'No sync by noon (R29).')}
${stateCard(s.noSync.pill, s.noSync.afterNoon, [s.noSync.detail], 'The first sync came after noon (R29).')}
${stateCard(s.notEnoughData.pill, s.notEnoughData.headline, [s.notEnoughData.noSleep], 'No sleep recorded, or the night was still unfinished at noon (R31).')}
${stateCard(s.notEnoughData.pill, s.notEnoughData.headline, [s.notEnoughData.tooFew], 'Two or more readings missing (R31).')}
${stateCard(s.learning.pill, s.learning.headline, [s.learning.progress(14, v2.needed), learningLastNight({ asleep_min: 370, hrv: 41.6, sleeping_hr: 55 }) ?? ''], 'Two or more normals still being learned (R32): values, no verdicts, no status.')}
<div class="pair"><div class="phone"><h3>${esc(s.rejected.headline)}</h3><p>${esc(s.rejected.token)}</p><div class="link">${esc(s.rejected.settings)}</div></div><div class="side"><p class="muted">The Shortcut’s token was replaced (R11). Shown above whatever else the card says.</p><p>Other rejections: “${esc(s.rejected.other)}”</p></div></div>
<div class="pair"><div class="phone"><p>${esc(w.sync.importProgress(5))}</p></div><div class="side"><p class="muted">While the one-year import is under 12 months (R12).</p></div></div>
<div class="pair"><div class="phone"><div class="row">${pill(w.card.status.ease_off, 'ease_off')}${pill(w.card.late, 'neutral')}<span class="muted">${esc(w.card.synced(w.time.at('11:48am')))}</span></div></div><div class="side"><p class="muted">A sync between 11:30am and noon gives the normal card, marked late with the grey pill (R28).</p></div></div>

<h2>3. Check-in</h2>
<div class="pair"><div class="phone"><h3>${esc(w.checkin.question)}</h3><div class="buttons"><span>${esc(w.checkin.answers.good)}</span><span>${esc(w.checkin.answers.okay)}</span><span>${esc(w.checkin.answers.off)}</span></div><p class="muted">${esc(w.checkin.hint)}</p><div class="link" style="border:0">${esc(w.checkin.skip)}</div></div>
<div class="side"><p class="muted">First open of the day, before the status (R16).</p><p>On the card afterwards: “${esc(w.checkin.saidBefore)} <b>${esc(w.checkin.answerInline.okay)}</b> ${esc(w.checkin.saidAfter)}” with “${esc(w.checkin.change)}”.</p><p>After Skip: “${esc(w.checkin.question)}” with “${esc(w.checkin.answer)}”.</p></div></div>

<h2>4. Greeting and date</h2>
<p>${esc(w.day.date('Tuesday', 29, 'September'))} · ${esc(w.day.morning)} (before noon) · ${esc(w.day.afternoon)} (noon to 6pm) · ${esc(w.day.evening)} (from 6pm)</p>

<h2>5. Nudges</h2>
<table>${Object.values(w.card.nudges).map((n) => `<tr><td>${esc(n.action)}</td><td>${esc(n.detail)}</td></tr>`).join('')}</table>

<h2>6. Why today</h2>
<p><b>Titles:</b> ${Object.values(w.card.why).map(esc).join(' · ')}</p>
<table>
${(['hrv', 'sleep', 'sleeping_hr'] as const).map((r) => `<tr><td>${esc(w.why.titles[r])}</td><td>${esc(w.why.explainers[r])}</td></tr>`).join('')}
<tr><td>Verdicts</td><td>${Object.values(w.why.verdicts).map(esc).join(' · ')} · ${esc(w.why.building(14, v2.needed))}</td></tr>
<tr><td>Chart labels</td><td>${esc(w.why.chart.start)} · ${esc(w.why.chart.band)} · ${esc(w.why.chart.end)}</td></tr>
<tr><td>${esc(w.why.showNumbers)}</td><td>${esc(w.why.numbers.range)}: ${esc(w.why.numbers.rangeValue('40', '64', 'ms'))}<br>${esc(w.why.numbers.vsNormal)}: ${esc(w.why.numbers.lower('14 ms'))}<br>${esc(w.why.numbers.fourWeeks)}: ${esc(w.why.numbers.lowest)} (or “${esc(w.why.numbers.lowerThan(20, 27))}”)<br><span class="muted">${esc(w.why.numbers.footnote(v2.window))}</span></td></tr>
<tr><td>Sleep values</td><td>Last night ${esc(formatDuration(352))}, normal for you ${esc(formatDuration(430))}; vs normal: ${esc(w.why.numbers.less(formatDuration(78)))}</td></tr>
</table>
<p class="scenario">${esc(w.why.alsoChecked.title)}</p>
<table>
<tr><td>Both normal, check clear</td><td>${esc(alsoChecked({ value: 14.8, verdict: 'in_range' }, { value: 55, verdict: 'in_range' }, 'clear').join(' '))}</td></tr>
<tr><td>Breathing up, check fired</td><td>${esc(alsoChecked({ value: 17.2, verdict: 'above' }, { value: 61, verdict: 'above' }, 'fired').join(' '))}</td></tr>
<tr><td>A reading missing, check couldn’t run</td><td>${esc(alsoChecked({ value: 14.8, verdict: 'in_range' }, { value: null, verdict: 'missing' }, 'not_run').join(' '))}</td></tr>
<tr><td>Still learning</td><td>${esc(alsoChecked({ value: 14.8, verdict: 'building' }, { value: 55, verdict: 'in_range' }, 'clear').join(' '))}</td></tr>
</table>
<p class="scenario">${esc(decided.title)}</p>
<table>
<tr><td>Explanation</td><td>${esc(decided.intro)} ${esc(decided.order('Heart rate variability', 'sleeping heart rate', 'sleep'))} ${esc(decided.adds.ease_off)}</td></tr>
<tr><td>${esc(w.why.showNumbers)}</td><td>${esc(w.why.titles.hrv)} 0.9 · ${esc(w.why.titles.sleep)} 0.6 · ${esc(w.why.titles.sleeping_hr)} 0.1 · ${esc(decided.total)} 1.6 (a missing reading: “${esc(decided.notCounted)}”)<br>
${esc(decided.zones.ready)} ${esc(decided.under(v2.ease))} · ${esc(decided.zones.ease_off)} ${esc(decided.between(v2.ease, v2.rest))} · ${esc(decided.zones.rest)} ${esc(decided.orMore(v2.rest))} · today’s box labelled “${esc(decided.today)}”</td></tr>
<tr><td>Footnote</td><td>${esc(decided.footnote(v2.window, 42))}<br>${esc(decided.footnote(v2.window, 39))}</td></tr>
</table>

<h2>7. Notifications (sent from Phase 4)</h2>
<table>
<tr><td>Morning</td><td>${esc(morningNotification(sampleDay) ?? '')}</td></tr>
<tr><td>11:30 reminder</td><td>${esc(w.push.reminder)}</td></tr>
<tr><td>8pm question</td><td>${esc(w.push.followUp)}</td></tr>
</table>
</main></body></html>`

console.log(html)
