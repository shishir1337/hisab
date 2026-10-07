'use client'

import { syncStatusLabel } from '@hisab/db'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { useEffect, useState } from 'react'
import { useSyncConfig } from './provider'

/** Combines PowerSync status, upload queue size and parked issues into one label. */
export function useSyncStatus() {
  const db = usePowerSync()
  const status = useStatus()
  const { localOnly } = useSyncConfig()
  const { data: issues } = useQuery<{ n: number }>('select count(*) as n from upload_issues')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      db.getUploadQueueStats().then((s) => {
        if (!cancelled) setPendingCount(s.count)
      })
    void refresh()
    const id = setInterval(refresh, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [db, status])

  return syncStatusLabel({
    connected: status.connected,
    uploading: status.dataFlowStatus.uploading,
    downloading: status.dataFlowStatus.downloading,
    pendingCount,
    issueCount: issues[0]?.n ?? 0,
    localOnly,
  })
}
