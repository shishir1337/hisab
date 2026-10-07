'use client'

import type { SyncStatusKind } from '@hisab/db'
import { useSyncStatus } from '@/lib/powersync/use-sync-status'
import { cn } from '@/lib/utils'

const DOT: Record<SyncStatusKind, string> = {
  ok: 'bg-positive',
  syncing: 'bg-text-faint animate-pulse',
  offline: 'bg-text-faint',
  issues: 'bg-warning',
  local: 'bg-text-faint',
}

/** Subtle sync indicator (spec §9): never a spinner, never blocking. */
export function SyncPill({ compact = false }: { compact?: boolean }) {
  const { kind, label } = useSyncStatus()
  return (
    <span
      role="status"
      title={kind === 'local' ? 'Sync is not set up yet — data is saved in this browser.' : label}
      className={cn(
        'inline-flex items-center gap-2 rounded-full text-[12px] text-text-muted',
        compact ? 'px-2 py-1' : 'self-start border border-border bg-surface px-2.5 py-1',
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[kind])} aria-hidden />
      <span className={cn(compact && 'sr-only')}>{label}</span>
    </span>
  )
}
