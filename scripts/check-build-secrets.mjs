// Fails the build if anything secret ended up in the files sent to browsers.
// Runs after every build, on GitHub and on Vercel. On Vercel, the Supabase
// integration puts the real secret values in the environment, so this also
// checks that none of those exact values appear in the built app.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SECRET_ENV_NAMES = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'POSTGRES_PASSWORD',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'VAPID_PRIVATE_KEY',
]

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

const problems = []
const secretValues = SECRET_ENV_NAMES.map((n) => [n, process.env[n]]).filter(([, v]) => v && v.length >= 8)

for (const file of files('dist')) {
  const text = readFileSync(file, 'utf8')
  for (const [name, value] of secretValues) {
    if (text.includes(value)) problems.push(`${file}: contains the value of ${name}`)
  }
  // A real secret key is the prefix followed by the key itself. The bare
  // prefix appears inside the Supabase library, which checks key types.
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) problems.push(`${file}: contains a Supabase secret key`)
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) ?? []) {
    try {
      const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role
      if (role && role !== 'anon') problems.push(`${file}: contains a token with the "${role}" role`)
    } catch {
      // not a token
    }
  }
}

if (problems.length) {
  console.error('Secret check failed:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`Secret check passed (${secretValues.length} secret values compared).`)
