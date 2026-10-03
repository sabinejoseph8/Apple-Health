// Upload tokens (tech-spec section 6): 32 random bytes, shown to the user
// once, stored only as a SHA-256 hash. The "clv_" prefix makes a token easy
// to recognise if it's ever pasted somewhere it shouldn't be.

const PREFIX = 'clv_'
const TOKEN_PATTERN = /^clv_[A-Za-z0-9_-]{43}$/

export function generateUploadToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = btoa(String.fromCharCode(...bytes))
  return PREFIX + base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function looksLikeUploadToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

// Lowercase hex SHA-256 of the whole token, as stored in upload_tokens.
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
