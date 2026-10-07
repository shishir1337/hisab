import { describe, it, expect } from 'vitest'
import { parseStoredSession, storageKeyFor } from './stored-session'

describe('storageKeyFor', () => {
  it('matches supabase-js default key', () =>
    expect(storageKeyFor('https://qopvfcrjpdlsnwughqlx.supabase.co')).toBe('sb-qopvfcrjpdlsnwughqlx-auth-token'))
})

describe('parseStoredSession', () => {
  const session = { access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'me@x.dev' } }

  it('reads the user from a stored (even expired) session', () =>
    expect(parseStoredSession(JSON.stringify(session))).toEqual({ userId: 'u1', email: 'me@x.dev' }))
  it('null when nothing stored', () => expect(parseStoredSession(null)).toBeNull())
  it('null on corrupt json', () => expect(parseStoredSession('{oops')).toBeNull())
  it('null without a refresh token (cannot be resumed)', () =>
    expect(parseStoredSession(JSON.stringify({ ...session, refresh_token: '' }))).toBeNull())
  it('null without a user id', () => expect(parseStoredSession(JSON.stringify({ ...session, user: {} }))).toBeNull())
})
