#!/usr/bin/env node
// Checks the demo build (D95, Phase 9) and the live build against each other.
//
//   node scripts/check-demo-bundle.mjs demo dist-demo   the demo holds none of the project's
//                                                       address or keys, no email address but the
//                                                       made-up ones and the consent text's one
//                                                       contact, and it does hold the demo's setup
//   node scripts/check-demo-bundle.mjs live dist        the live app holds none of the demo
//
// It reads built files only, never anyone's data. Exit 1 on any problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [kind, dir] = process.argv.slice(2)
if (!['demo', 'live'].includes(kind) || !dir || !existsSync(dir)) {
  console.error('Usage: node scripts/check-demo-bundle.mjs demo|live <built folder>')
  process.exit(2)
}

function* files(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(js|css|html|webmanifest|json|svg)$/.test(name)) yield [path, readFileSync(path, 'utf8')]
  }
}

const problems = []
const all = [...files(dir)]

if (kind === 'live') {
  for (const [path, text] of all) {
    for (const marker of ['demo.invalid', 'Demo with made-up data', 'demo-publishable-key']) {
      if (text.includes(marker)) problems.push(`${path}: holds the demo's "${marker}"`)
    }
  }
} else {
  // The project's own address and keys, from the project's documents and from any local
  // environment file or variable, so a key added later is caught too.
  const forbidden = ['vuynnnrijdbvamwfauog', 'pupxkjhhhgeeoqyvtsst']
  for (const name of ['.env', '.env.local', '.env.production', '.env.development']) {
    if (!existsSync(name)) continue
    for (const line of readFileSync(name, 'utf8').split('\n')) {
      const value = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
      if (value.length >= 12) forbidden.push(value)
    }
  }
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_VAPID_PUBLIC_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
    if ((process.env[name] ?? '').length >= 12) forbidden.push(process.env[name])
  }
  const looksLikeKey = [/sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /sk-ant-[A-Za-z0-9_-]{16,}/]
  const allowedEmail = /@example\.test$|^notions_close_5p@icloud\.com$/
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  for (const [path, text] of all) {
    for (const value of forbidden) if (text.includes(value)) problems.push(`${path}: holds a value from the project (${value.slice(0, 6)}...)`)
    for (const rx of looksLikeKey) if (rx.test(text)) problems.push(`${path}: holds something shaped like a key (${rx})`)
    for (const found of text.match(email) ?? []) {
      if (/\.(png|jpg|svg|js|css)$/i.test(found)) continue
      if (!allowedEmail.test(found)) problems.push(`${path}: holds the email address ${found}`)
    }
  }
  const joined = all.map(([, t]) => t).join('\n')
  for (const needed of ['demo.invalid', 'Demo with made-up data']) {
    if (!joined.includes(needed)) problems.push(`the demo build is missing "${needed}"`)
  }
}

if (problems.length) {
  console.error(`${kind} build check failed:`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`${kind} build check passed (${all.length} files in ${dir}).`)
