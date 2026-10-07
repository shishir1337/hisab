import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

interface SessionState {
  session: Session | null
  /** False until the stored session has been read (keep the splash screen up until then). */
  ready: boolean
}

const SessionContext = createContext<SessionState>({ session: null, ready: false })
export const useSession = () => use(SessionContext)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, ready: true }))
    return () => data.subscription.unsubscribe()
  }, [])

  return <SessionContext value={state}>{children}</SessionContext>
}
