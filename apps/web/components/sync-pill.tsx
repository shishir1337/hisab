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

const EXPLAIN: Record<SyncStatusKind, string> = {
  ok: 'All changes are saved and synced.',
  syncing: 'Saving your latest changes to the cloud…',
  offline: 'You’re offline. Changes are saved in this browser and will sync when you’re back online.',
  issues: 'Some changes couldn’t sync. See Settings → Your data.',
  local: 'Sync isn’t set up yet — your data is saved in this browser.',
}

/** Subtle sync indicator (spec §9): a dot and a short label, never a spinner, never blocking. */
export function SyncStatus({ className }: { className?: string }) {
  const { kind, label } = useSyncStatus()
  return (
    <span role="status" title={EXPLAIN[kind]} className={cn('inline-flex min-w-0 items-center gap-1.5 text-[12px] text-text-muted', className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[kind])} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}
