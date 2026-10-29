// Runs the app signed in as a made-up tester, with the phone's clock fixed
// and the database's answers made up, so the screens can be tested at iPhone
// size without a database. Nothing here is anyone's real data. The answers
// themselves come from src/demo/answer.ts, which the demo build uses too.
import type { Page, Route } from '@playwright/test'
import { answerRequest, SESSION, TZ, withConsent, type Tables } from '../../src/demo/answer'

export { TZ, type Tables }
export { dailySync } from '../../src/demo/data'

export interface MockApp {
  // Every call the app made to a database function, in order.
  calls: { name: string; body: unknown }[]
  // Every table the app read, in order.
  reads: string[]
}

// The clock is fixed at `at`; with `ticking`, it starts there and the test
// moves it on with page.clock.fastForward.
export async function openApp(
  page: Page,
  { at, tables, path = '/', ticking = false }: { at: string; tables: Tables; path?: string; ticking?: boolean },
): Promise<MockApp> {
  const app: MockApp = { calls: [], reads: [] }
  tables = withConsent(tables)
  if (ticking) await page.clock.install({ time: new Date(at) })
  else await page.clock.setFixedTime(new Date(at))
  await page.addInitScript((session) => localStorage.setItem('clarivi-auth', session), JSON.stringify(SESSION))

  await page.route('http://127.0.0.1:54321/**', async (route: Route) => {
    const reply = answerRequest({ tables, calls: app.calls, reads: app.reads }, {
      url: route.request().url(),
      body: () => route.request().postDataJSON(),
    })
    if (reply.abort) return route.abort('internetdisconnected')
    if (reply.body === undefined) return route.fulfill({ status: reply.status })
    return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })

  await page.goto(path)
  return app
}
