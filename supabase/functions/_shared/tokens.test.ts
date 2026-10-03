import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { generateUploadToken, hashToken, looksLikeUploadToken } from './tokens.ts'

Deno.test('a new token is 32 random bytes with the clv_ prefix', () => {
  const token = generateUploadToken()
  assert(looksLikeUploadToken(token), token)
  assertEquals(token.length, 4 + 43)
  assertNotEquals(generateUploadToken(), token)
})

Deno.test('anything else is not a token', () => {
  for (const value of ['', 'clv_short', 'Bearer clv_x', `xyz_${'a'.repeat(43)}`, `clv_${'a'.repeat(42)}!`]) {
    assert(!looksLikeUploadToken(value), value)
  }
})

Deno.test('a token is stored as its SHA-256 in lowercase hex', async () => {
  assertEquals(await hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
