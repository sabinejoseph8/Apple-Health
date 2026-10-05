import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { pickKey } from './http.ts'

// D81: the functions keep working while a secret key is replaced.
Deno.test('the key named "default" is used while it exists', () => {
  assertEquals(pickKey('{"default":"sb_secret_old","clarivi":"sb_secret_new"}', 'legacy', 'key'), 'sb_secret_old')
})

Deno.test('after the old key is withdrawn, the new one is used whatever its name', () => {
  assertEquals(pickKey('{"clarivi":"sb_secret_new"}', 'legacy', 'key'), 'sb_secret_new')
})

Deno.test('the older single-key setting is the last resort', () => {
  assertEquals(pickKey(undefined, 'legacy', 'key'), 'legacy')
  assertEquals(pickKey('{}', 'legacy', 'key'), 'legacy')
  assertEquals(pickKey('not json', 'legacy', 'key'), 'legacy')
})

Deno.test('no key at all is an error, not a silent failure', () => {
  assertThrows(() => pickKey(undefined, undefined, 'SUPABASE_SECRET_KEYS'), Error, 'missing SUPABASE_SECRET_KEYS')
})
