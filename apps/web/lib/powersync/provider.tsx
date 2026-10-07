'use client'

import { AppSchema, SupabaseConnector } from '@hisab/db'
import type { AbstractPowerSyncDatabase } from '@powersync/web'
import { PowerSyncContext } from '@powersync/react'
import { useRouter } from 'next/navigation'
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

const UserIdContext = createContext<string>('')
/** The signed-in user's id (the local database belongs to exactly this user). */
export const useUserId = () => use(UserIdContext)

/**
 * Opens this user's in-browser SQLite database (`hisab-<userId>.db`) and connects sync when configured.
 * Nothing is ever wiped on sign-out: unsynced entries wait for the same user, and another user gets
 * their own database (review C2/I1). Renders `fallback` until the database is ready.
 */
export function PowerSyncProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [ready, setReady] = useState<{ db: AbstractPowerSyncDatabase; userId: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    let disposed = false
    let instance: AbstractPowerSyncDatabase | undefined
    const supabase = getSupabase()
    const connector = new SupabaseConnector(supabase, { powersyncUrl: POWERSYNC_URL })

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) {
        router.replace('/sign-in')
        return
      }
      const { PowerSyncDatabase } = await import('@powersync/web')
      instance = new PowerSyncDatabase({
        schema: AppSchema,
        database: { dbFilename: `hisab-${userId}.db`, worker: WORKER },
        sync: { worker: WORKER },
      })
      await instance.init()
      if (disposed) return void instance.close()
      if (connector.syncEnabled) void instance.connect(connector)
      setReady({ db: instance, userId })
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        void instance?.disconnect()
        router.replace('/sign-in')
      }
    })

    return () => {
      disposed = true
      sub.subscription.unsubscribe()
      void instance?.close()
    }
  }, [router])

  if (!ready) return fallback
  return (
    <SyncConfigContext value={{ localOnly: !POWERSYNC_URL }}>
      <UserIdContext value={ready.userId}>
        <PowerSyncContext.Provider value={ready.db}>{children}</PowerSyncContext.Provider>
      </UserIdContext>
    </SyncConfigContext>
  )
}
