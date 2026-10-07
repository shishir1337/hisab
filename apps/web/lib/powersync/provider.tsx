'use client'

import { AppSchema, SupabaseConnector } from '@hisab/db'
import type { AbstractPowerSyncDatabase } from '@powersync/web'
import { PowerSyncContext } from '@powersync/react'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase/client'

const POWERSYNC_URL = process.env.NEXT_PUBLIC_POWERSYNC_URL || undefined
/** Served from /public by `pnpm assets` (powersync-web copy-assets). */
const WORKER = '/@powersync/worker.js'

interface SyncConfig {
  /** True when no PowerSync instance is configured: data lives only in this browser. */
  localOnly: boolean
}
const SyncConfigContext = createContext<SyncConfig>({ localOnly: !POWERSYNC_URL })
export const useSyncConfig = () => use(SyncConfigContext)

/**
 * Opens the in-browser SQLite database (client-only) and connects sync when configured.
 * Renders `fallback` until the local database is ready (a few ms after first load).
 */
export function PowerSyncProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [db, setDb] = useState<AbstractPowerSyncDatabase | null>(null)

  useEffect(() => {
    let disposed = false
    let instance: AbstractPowerSyncDatabase | undefined
    const supabase = getSupabase()
    const connector = new SupabaseConnector(supabase, { powersyncUrl: POWERSYNC_URL })

    ;(async () => {
      const { PowerSyncDatabase } = await import('@powersync/web')
      instance = new PowerSyncDatabase({
        schema: AppSchema,
        database: { dbFilename: 'hisab.db', worker: WORKER },
        sync: { worker: WORKER },
      })
      await instance.init()
      if (disposed) return void instance.close()
      if (connector.syncEnabled) void instance.connect(connector)
      setDb(instance)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Signing out wipes the local copy so the next account starts clean.
      if (event === 'SIGNED_OUT') void instance?.disconnectAndClear()
    })

    return () => {
      disposed = true
      sub.subscription.unsubscribe()
      void instance?.close()
    }
  }, [])

  if (!db) return fallback
  return (
    <SyncConfigContext value={{ localOnly: !POWERSYNC_URL }}>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </SyncConfigContext>
  )
}
