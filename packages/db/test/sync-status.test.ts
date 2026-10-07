import { describe, it, expect } from 'vitest'
import { syncStatusLabel } from '../src/sync-status'

const base = { connected: true, uploading: false, downloading: false, pendingCount: 0, issueCount: 0 }

describe('syncStatusLabel', () => {
  it('up to date when connected and idle', () =>
    expect(syncStatusLabel(base)).toEqual({ kind: 'ok', label: 'Up to date' }))
  it('syncing while uploading', () =>
    expect(syncStatusLabel({ ...base, uploading: true })).toEqual({ kind: 'syncing', label: 'Syncing' }))
  it('syncing while downloading', () =>
    expect(syncStatusLabel({ ...base, downloading: true }).kind).toBe('syncing'))
  it('offline with pending writes', () =>
    expect(syncStatusLabel({ ...base, connected: false, pendingCount: 3 })).toEqual({
      kind: 'offline',
      label: 'Offline · 3 pending',
    }))
  it('offline with nothing pending', () =>
    expect(syncStatusLabel({ ...base, connected: false })).toEqual({ kind: 'offline', label: 'Offline' }))
  it('issues take priority over everything', () =>
    expect(syncStatusLabel({ ...base, connected: false, uploading: true, issueCount: 2 })).toEqual({
      kind: 'issues',
      label: '2 issues',
    }))
  it('singular issue', () => expect(syncStatusLabel({ ...base, issueCount: 1 }).label).toBe('1 issue'))
  it('connected but pending shows syncing', () =>
    expect(syncStatusLabel({ ...base, pendingCount: 2 }).kind).toBe('syncing'))
  it('local-only mode (sync not configured)', () =>
    expect(syncStatusLabel({ ...base, connected: false, localOnly: true })).toEqual({
      kind: 'local',
      label: 'On this device',
    }))
})
