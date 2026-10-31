// The demo build's setup (D95). It runs before the app does, and gives the app a signed-in
// made-up tester, a clock set to the chosen morning, and a database that is a few lines of
// code inside the page: every request to the demo address is answered from made-up
// tables (answer.ts), and nothing leaves the browser. The live app does not contain this file.
import './demo.css'
import { answerRequest, SESSION, withConsent, type MockState } from './answer'
import { DEMO_URL } from './constants'
import { DEFAULT_SCENARIO, SCENARIOS, scenarioNow, type Scenario } from './scenarios'

export const demo: boolean = true

const scenario: Scenario = SCENARIOS.find((s) => s.id === new URLSearchParams(location.search).get('scenario')) ?? SCENARIOS.find((s) => s.id === DEFAULT_SCENARIO)!

// The clock starts at the morning's time on the visitor's own calendar and then runs on.
const RealDate = Date
const offset = scenarioNow(scenario).getTime() - RealDate.now()
class DemoDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset)
    else super(...(args as [number]))
  }
  static now() {
    return RealDate.now() + offset
  }
}
globalThis.Date = DemoDate as unknown as DateConstructor

const state: MockState = {
  tables: withConsent(scenario.tables(new Date())),
  calls: [],
  reads: [],
  stateful: true,
  now: () => new Date(),
}

try {
  localStorage.setItem('clarivi-auth', JSON.stringify(SESSION))
} catch {
  // A browser that blocks storage shows the sign-in screen, which also works here.
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith(DEMO_URL)) return realFetch(input, init)
  let text: string | undefined = typeof init?.body === 'string' ? init.body : undefined
  if (text === undefined && input instanceof Request) text = await input.clone().text()
  const reply = answerRequest(state, { url, body: () => (text ? JSON.parse(text) : null) })
  if (reply.abort) throw new TypeError('Failed to fetch')
  const hasBody = reply.body !== undefined && reply.status !== 204
  return new Response(hasBody ? JSON.stringify(reply.body) : null, {
    status: reply.status,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
  })
}

if (!location.hash && scenario.hash) location.hash = scenario.hash

// The banner: what this is, and a way to pick another morning.
function mountBanner() {
  const bar = document.createElement('div')
  bar.className = 'demo-banner'
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', 'Demo')
  const title = document.createElement('strong')
  title.textContent = 'Demo with made-up data'
  const label = document.createElement('label')
  label.append('Morning ')
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'Choose a morning')
  for (const s of SCENARIOS) {
    const option = document.createElement('option')
    option.value = s.id
    option.textContent = s.label
    option.selected = s.id === scenario.id
    select.append(option)
  }
  select.addEventListener('change', () => {
    location.assign(`${location.pathname}?scenario=${encodeURIComponent(select.value)}`)
  })
  label.append(select)
  const note = document.createElement('p')
  note.textContent = 'Nothing here is real. The AI texts are fixed examples, and nothing leaves your browser.'
  bar.append(title, label, note)
  document.body.prepend(bar)
}
if (document.body) mountBanner()
else document.addEventListener('DOMContentLoaded', mountBanner)
