/** supabase-js default storage key: `sb-<project-ref>-auth-token`. */
export function storageKeyFor(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
}

export interface StoredUser {
  userId: string
  email: string | null
}

/**
 * Who is signed in on this device, read from the persisted session without refreshing it.
 * An expired access token still counts: the user stays signed in offline and the token refreshes
 * once the network is back (spec §1: logging must work offline).
 */
export function parseStoredSession(raw: string | null): StoredUser | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as { refresh_token?: string; user?: { id?: string; email?: string } }
    if (!s.refresh_token || !s.user?.id) return null
    return { userId: s.user.id, email: s.user.email ?? null }
  } catch {
    return null
  }
}
