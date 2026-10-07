export interface SyncStatusInput {
  connected: boolean
  uploading: boolean
  downloading: boolean
  /** Local writes not yet acknowledged by the server. */
  pendingCount: number
  /** Writes the server rejected permanently (see `upload_issues`). */
  issueCount: number
  /** Sync is not configured (no PowerSync URL); data lives only on this device. */
  localOnly?: boolean
}

export type SyncStatusKind = 'ok' | 'syncing' | 'offline' | 'issues' | 'local'

export function syncStatusLabel(s: SyncStatusInput): { kind: SyncStatusKind; label: string } {
  if (s.issueCount > 0) {
    return { kind: 'issues', label: `${s.issueCount} ${s.issueCount === 1 ? 'issue' : 'issues'}` }
  }
  if (s.localOnly) return { kind: 'local', label: 'On this device' }
  if (!s.connected) {
    return { kind: 'offline', label: s.pendingCount > 0 ? `Offline · ${s.pendingCount} pending` : 'Offline' }
  }
  if (s.uploading || s.downloading || s.pendingCount > 0) return { kind: 'syncing', label: 'Syncing' }
  return { kind: 'ok', label: 'Up to date' }
}
