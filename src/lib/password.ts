import { wording } from '../../supabase/functions/_shared/wording'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 72

// Returns the message to show, or null when the new password can be saved.
export function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return wording.setPassword.tooShort
  if (password.length > MAX_PASSWORD_LENGTH) return wording.setPassword.tooLong
  if (password !== confirm) return wording.setPassword.mismatch
  return null
}
