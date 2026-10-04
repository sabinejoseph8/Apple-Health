import { supabase } from './supabase'

// Calls one of Clarivi's server functions with the user's session. On a
// refusal it gives the function's error code ("wrong_password"), or
// "offline" when there was no readable reply.
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return { ok: true, data: data as T }
  try {
    const code = (await (error as { context?: Response }).context?.json())?.error
    return { ok: false, code: typeof code === 'string' ? code : 'offline' }
  } catch {
    return { ok: false, code: 'offline' }
  }
}
