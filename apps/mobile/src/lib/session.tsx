import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { parseStoredSession, type StoredUser } from './stored-session'
import { SESSION_STORAGE_KEY, sessionStorage, supabase } from './supabase'

interface SessionState {
  user: StoredUser | null
  /** False until the stored session has been read (keep the splash screen up until then). */
  ready: boolean
}

const SessionContext = createContext<SessionState>({ user: null, ready: false })
export const useSession = () => use(SessionContext)

/**
 * Signed-in state comes from the session persisted on the device, not from a successful token
 * refresh — so opening the app offline with an expired access token still lands on the tabs
 * (review C1). Only explicit auth events change it afterwards.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, ready: false })

  useEffect(() => {
    let alive = true
    sessionStorage
      .getItem(SESSION_STORAGE_KEY)
      .then(parseStoredSession)
      .catch(() => null)
      .then((user) => alive && setState({ user, ready: true }))

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session) setState({ user: { userId: session.user.id, email: session.user.email ?? null }, ready: true })
      } else if (event === 'SIGNED_OUT') {
        setState({ user: null, ready: true })
      }
      // INITIAL_SESSION with no session happens offline when the refresh fails; the stored session wins.
    })
    // Kick off a refresh in the background when possible.
    void supabase.auth.getSession()

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <SessionContext value={state}>{children}</SessionContext>
}
