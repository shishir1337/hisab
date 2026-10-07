import { AppSchema, ensureDefaultCategories, SupabaseConnector } from '@hisab/db'
import { PowerSyncContext, useStatus } from '@powersync/react'
import { PowerSyncDatabase } from '@powersync/react-native'
import { createContext, use, useEffect, useMemo, type ReactNode } from 'react'
import { useSession } from './session'
import { supabase } from './supabase'

const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL || undefined
const connector = new SupabaseConnector(supabase, { powersyncUrl: POWERSYNC_URL })

const SyncConfigContext = createContext({ localOnly: !POWERSYNC_URL })
export const useSyncConfig = () => use(SyncConfigContext)

/**
 * True once this device holds the user's data: always in local-only mode, otherwise after the first
 * complete sync (persisted, so it stays true offline on later launches). Until then an empty local
 * database means "not downloaded yet", not "new user" — never treat it as a first run.
 */
export function useDataReady(): boolean {
  const { localOnly } = useSyncConfig()
  const status = useStatus()
  return localOnly || status.hasSynced === true
}

/**
 * One on-device SQLite file per user (`hisab-<userId>.db`). Signing out — voluntarily or because a
 * refresh token was revoked — never deletes anything: unsynced entries wait for that user to sign
 * back in, and a different user on the same phone gets their own clean database (review C2/I1).
 */
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const userId = user?.userId

  const db = useMemo(
    () =>
      userId
        ? new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: `hisab-${userId}.db` } })
        : null,
    [userId],
  )

  useEffect(() => {
    if (!db || !userId) return
    if (connector.syncEnabled) {
      void db.connect(connector)
      // With sync, the server already has this user's categories: seed only if still empty after the first sync.
      void db.waitForFirstSync().then(() => ensureDefaultCategories(db, userId)).catch(() => {})
    } else {
      // Local-only: default categories (same ids as the server seed) so logging works right away.
      void ensureDefaultCategories(db, userId).catch(() => {})
    }
    return () => void db.close()
  }, [db, userId])

  if (!db) return <>{children}</>
  return (
    <SyncConfigContext value={{ localOnly: !POWERSYNC_URL }}>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </SyncConfigContext>
  )
}
