import { AppSchema, SupabaseConnector } from '@hisab/db'
import { PowerSyncContext } from '@powersync/react'
import { PowerSyncDatabase } from '@powersync/react-native'
import { createContext, use, useEffect, type ReactNode } from 'react'
import { useSession } from './session'
import { supabase } from './supabase'

const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL || undefined

/** On-device SQLite (op-sqlite). All reads and writes go here first (spec §4.2). */
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'hisab.db' },
})

const connector = new SupabaseConnector(supabase, { powersyncUrl: POWERSYNC_URL })

const SyncConfigContext = createContext({ localOnly: !POWERSYNC_URL })
export const useSyncConfig = () => use(SyncConfigContext)

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    if (connector.syncEnabled) void db.connect(connector)
    return () => void db.disconnect()
  }, [userId])

  // Signing out wipes the local copy so the next account starts clean.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') void db.disconnectAndClear()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <SyncConfigContext value={{ localOnly: !POWERSYNC_URL }}>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </SyncConfigContext>
  )
}
