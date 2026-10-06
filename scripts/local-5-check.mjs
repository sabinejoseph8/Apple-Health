// Local end-to-end check for Phase 5's account settings. Run with:
// npm run check:local:account
// Needs the local copy of Supabase (npm run db:start) and the functions
// running (npx supabase functions serve). Uses only made-up accounts and
// data, and deletes them at the end.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(st.API_URL)) throw new Error('local copy only')
const URL_ = st.API_URL, PUB = st.PUBLISHABLE_KEY
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sql = (q) => execSync(`docker exec -i supabase_db_clarivi psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()
const admin = createClient(URL_, st.SECRET_KEY, { auth: { persistSession: false } })
const client = () => createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } })
sql(`delete from auth.users where email like 'account-%@example.test';`)

const email = `account-${Date.now()}@example.test`
const first = 'local-account-check-1'
const { data: made } = await admin.auth.admin.createUser({ email, password: first, email_confirm: true })
const uid = made.user.id
const app = client()
await app.auth.signInWithPassword({ email, password: first })
const noConsentYet = await (async () => {
  const { data: { session } } = await app.auth.getSession()
  const r = await fetch(`${URL_}/functions/v1/account-token`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: first }) })
  return { status: r.status, body: await r.json().catch(() => null) }
})()
ok(noConsentYet.status === 403 && noConsentYet.body.error === 'no_consent', 'no upload token before agreeing to the consent text (D79)')
await app.rpc('give_consent', { p_version: 2, p_use: true, p_us_storage: true })
const call = async (who, name, body) => {
  const { data: { session } } = await who.auth.getSession()
  const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

// Change password (R4).
let r = await call(app, 'account-change-password', { current: 'not-my-password', password: 'a-brand-new-password' })
ok(r.status === 401 && r.body.error === 'wrong_password', 'a wrong current password is refused')
r = await call(app, 'account-change-password', { current: first, password: 'short' })
ok(r.status === 400 && r.body.error === 'too_short', 'a new password under 12 characters is refused')
r = await call(app, 'account-change-password', { current: first, password: first })
ok(r.status === 400 && r.body.error === 'same_password', 'the same password again is refused')
const second = 'local-account-check-2'
r = await call(app, 'account-change-password', { current: first, password: second })
ok(r.status === 200, 'the password is changed')
ok(!!(await client().auth.signInWithPassword({ email, password: first })).error, 'the old password no longer works')
const again = client()
ok(!(await again.auth.signInWithPassword({ email, password: second })).error, 'the new one does')

// Some of everything, then Delete my data (R59).
const token = await call(again, 'account-token', { password: second })
ok(token.status === 200 && typeof token.body.token === 'string', 'an upload token is made')
await again.rpc('submit_checkin', { p_date: new Date().toISOString().slice(0, 10), p_answer: 'okay' })
await again.rpc('log_usage', { p_event: 'card_view', p_meta: { state: 'waiting' } })
sql(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${uid}', 'https://push.example/${uid}', 'k', 'a');`)
const rowsFor = () => Number(sql(`select sum(n) from (
  select count(*) n from public.upload_tokens where user_id = '${uid}' union all
  select count(*) from public.checkins where user_id = '${uid}' union all
  select count(*) from public.usage_events where user_id = '${uid}' union all
  select count(*) from public.push_subscriptions where user_id = '${uid}') x;`))
ok(rowsFor() >= 4, 'the account has a token, a check-in, a log line and a phone')
r = await call(again, 'account-delete-data', { password: 'not-my-password' })
ok(r.status === 401 && rowsFor() >= 4, 'a wrong password deletes nothing (R8)')
r = await call(again, 'account-delete-data', { password: second })
ok(r.status === 200 && rowsFor() === 0, 'with the password, all of it is deleted (R59)')
ok(!(await client().auth.signInWithPassword({ email, password: second })).error, 'and the account still signs in')
ok(sql(`select count(*) from public.consents where user_id = '${uid}' and ended_at is null`) === '1', 'and keeps its agreement to the consent text')

// Withdraw consent (D80): deletes everything, ends the agreement, asks again.
await again.rpc('submit_checkin', { p_date: new Date().toISOString().slice(0, 10), p_answer: 'good' })
r = await call(again, 'account-withdraw-consent', { password: 'not-my-password' })
ok(r.status === 401 && sql(`select count(*) from public.checkins where user_id = '${uid}'`) !== '0', 'a wrong password withdraws nothing')
r = await call(again, 'account-withdraw-consent', { password: second })
ok(r.status === 200 && sql(`select count(*) from public.checkins where user_id = '${uid}'`) === '0', 'with the password, withdrawing deletes the data')
ok(sql(`select ended_why from public.consents where user_id = '${uid}'`) === 'withdrawn', 'and keeps the agreement, marked withdrawn')
r = await call(again, 'account-token', { password: second })
ok(r.status === 403 && r.body.error === 'no_consent', 'and no upload token until the person agrees again')
await again.rpc('give_consent', { p_version: 2, p_use: true, p_us_storage: true })

// Sign out everywhere (R7): one device ends every session.
const phone = client(), laptop = client()
await phone.auth.signInWithPassword({ email, password: second })
await laptop.auth.signInWithPassword({ email, password: second })
ok(!(await laptop.auth.refreshSession()).error, 'the laptop session works')
sql(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
     ('${uid}', 'https://push.example/phone-${uid}', 'k', 'a'), ('${uid}', 'https://push.example/laptop-${uid}', 'k', 'a');`)
const forgot = await phone.rpc('forget_all_devices')
ok(forgot.data === 2 && sql(`select count(*) from public.push_subscriptions where user_id = '${uid}' and revoked_at is null`) === '0',
  'sign out everywhere first stops notifications to both devices')
await phone.auth.signOut({ scope: 'global' })
ok(!!(await laptop.auth.refreshSession()).error, 'after sign out everywhere on the phone, the laptop is signed out too')
ok(!!(await laptop.auth.getUser()).error, 'and the server refuses its sign-in at once, which sends the app to sign-in')

// The owner resets a tester's password (R63, D74).
const ownerEmail = `account-owner-${Date.now()}@example.test`
const { data: ownerMade } = await admin.auth.admin.createUser({ email: ownerEmail, password: 'local-owner-check-1', email_confirm: true, app_metadata: { is_owner: true } })
const owner = client()
await owner.auth.signInWithPassword({ email: ownerEmail, password: 'local-owner-check-1' })
const tester = client()
await tester.auth.signInWithPassword({ email, password: second })
r = await call(tester, 'owner-reset-password', { email: ownerEmail, password: 'temporary-pass-1234' })
ok(r.status === 403 && r.body.error === 'not_owner', 'a tester cannot reset anyone')
r = await call(owner, 'owner-reset-password', { email: 'nobody@example.test', password: 'temporary-pass-1234' })
ok(r.status === 404, 'an unknown email is refused')
r = await call(owner, 'owner-reset-password', { email: ownerEmail, password: 'temporary-pass-1234' })
ok(r.status === 400 && r.body.error === 'own_account', 'the owner changes their own password in Settings instead')
r = await call(owner, 'owner-reset-password', { email: email.toUpperCase(), password: 'temporary-pass-1234' })
ok(r.status === 200, 'the owner gives the tester a temporary password')
const fresh = client()
const { data: signedIn } = await fresh.auth.signInWithPassword({ email, password: 'temporary-pass-1234' })
ok(signedIn.session?.user.app_metadata.must_change_password === true, 'it works, and the tester must choose their own next (R3)')
ok(!!(await client().auth.signInWithPassword({ email, password: second })).error, 'the old password no longer works')

await admin.auth.admin.deleteUser(uid)
await admin.auth.admin.deleteUser(ownerMade.user.id)
