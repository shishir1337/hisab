import { syncStatusLabel } from '@hisab/db'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useSyncConfig } from '@/lib/powersync'
import { useTheme } from '@/lib/theme'

/** Subtle sync indicator (spec §9): never a spinner, never blocking. */
export function SyncPill() {
  const db = usePowerSync()
  const status = useStatus()
  const { localOnly } = useSyncConfig()
  const { colors } = useTheme()
  const { data: issues } = useQuery<{ n: number }>('select count(*) as n from upload_issues')
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let alive = true
    const refresh = () => db.getUploadQueueStats().then((s) => alive && setPending(s.count))
    void refresh()
    const id = setInterval(refresh, 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [db, status])

  const { kind, label } = syncStatusLabel({
    connected: status.connected,
    uploading: status.dataFlowStatus.uploading,
    downloading: status.dataFlowStatus.downloading,
    pendingCount: pending,
    issueCount: issues[0]?.n ?? 0,
    localOnly,
  })
  const dot = kind === 'ok' ? colors.positive : kind === 'issues' ? colors.warning : colors.textFaint

  return (
    <View accessibilityRole="text" accessibilityLabel={`Sync: ${label}`} className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1">
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text style={{ fontSize: 11.5, color: colors.textMuted }}>{label}</Text>
    </View>
  )
}
