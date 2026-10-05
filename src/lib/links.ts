// The Clarivi Sync Shortcut testers install (Phase 6, D78 refined): an iCloud
// link made from a fresh blank copy. Checked on 4 October 2026: it names no
// one, holds no token, and asks each person for their own token on install.
export const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/27f05c2eac074e9a91f8d5759a527648'

// The card's Sync now button (D84): runs the Shortcut named "Clarivi Sync"
// with the input "button", which skips its sync-or-import question and is
// logged apart from the morning automations. Testers rename their copy to
// Clarivi Sync during setup (the guide says how).
export const SYNC_NOW_URL = 'shortcuts://run-shortcut?name=Clarivi%20Sync&input=text&text=button'
