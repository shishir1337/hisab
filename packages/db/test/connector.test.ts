import { describe, it, expect, vi } from 'vitest'
import { UpdateType } from '@powersync/common'
import { SupabaseConnector, isPermanentError } from '../src/connector'

type Op = { op: UpdateType; table: string; id: string; opData?: Record<string, unknown> }
type Err = { code: string; message: string } | null

function fakeSupabase(errorFor?: (table: string, kind: string) => Err) {
  const calls: Array<{ table: string; kind: string; payload?: unknown; id?: string }> = []
  const from = (table: string) => {
    const result = (kind: string, payload?: unknown, id?: string) => {
      calls.push({ table, kind, payload, id })
      return { error: errorFor?.(table, kind) ?? null }
    }
    return {
      upsert: async (payload: unknown) => result('upsert', payload),
      update: (payload: unknown) => ({ eq: async (_c: string, id: string) => result('update', payload, id) }),
      delete: () => ({ eq: async (_c: string, id: string) => result('delete', undefined, id) }),
    }
  }
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'tok', expires_at: 2000000000 } } }),
  }
  return { client: { from, auth } as never, calls }
}

function fakeDb(ops: Op[]) {
  const complete = vi.fn(async () => {})
  const execute = vi.fn(async (_sql: string, _params?: unknown[]) => ({}))
  let served = false
  const db = {
    getNextCrudTransaction: async () => {
      if (served) return null
      served = true
      return { crud: ops, complete }
    },
    execute,
  }
  return { db: db as never, complete, execute }
}

describe('SupabaseConnector.uploadData', () => {
  it('routes PUT/PATCH/DELETE', async () => {
    const sb = fakeSupabase()
    const { db, complete } = fakeDb([
      { op: UpdateType.PUT, table: 'accounts', id: 'a1', opData: { name: 'Cash' } },
      { op: UpdateType.PATCH, table: 'accounts', id: 'a1', opData: { name: 'Wallet' } },
      { op: UpdateType.DELETE, table: 'accounts', id: 'a1' },
    ])
    await new SupabaseConnector(sb.client, {}).uploadData(db)
    expect(sb.calls).toEqual([
      { table: 'accounts', kind: 'upsert', payload: { name: 'Cash', id: 'a1' }, id: undefined },
      { table: 'accounts', kind: 'update', payload: { name: 'Wallet' }, id: 'a1' },
      { table: 'accounts', kind: 'delete', payload: undefined, id: 'a1' },
    ])
    expect(complete).toHaveBeenCalledOnce()
  })

  it('converts 0/1 to booleans for boolean columns', async () => {
    const sb = fakeSupabase()
    const { db } = fakeDb([
      {
        op: UpdateType.PATCH,
        table: 'profiles',
        id: 'p',
        opData: { nudge_enabled: 0, hide_amounts: 1, theme: 'dark' },
      },
    ])
    await new SupabaseConnector(sb.client, {}).uploadData(db)
    expect(sb.calls[0]!.payload).toEqual({ nudge_enabled: false, hide_amounts: true, theme: 'dark' })
  })

  it('records a permanent (validation) error as an issue, continues, and completes', async () => {
    const sb = fakeSupabase((t) => (t === 'transactions' ? { code: '23514', message: 'check violation' } : null))
    const { db, complete, execute } = fakeDb([
      { op: UpdateType.PUT, table: 'transactions', id: 't1', opData: { amount_minor: 0 } },
      { op: UpdateType.PUT, table: 'accounts', id: 'a1', opData: { name: 'Cash' } },
    ])
    await new SupabaseConnector(sb.client, {}).uploadData(db)
    expect(execute).toHaveBeenCalledOnce()
    const [sql, params] = execute.mock.calls[0]!
    expect(sql).toMatch(/insert into upload_issues/i)
    expect(params).toContain('transactions')
    expect(params).toContain('23514')
    expect(sb.calls.map((c) => c.table)).toEqual(['transactions', 'accounts'])
    expect(complete).toHaveBeenCalledOnce()
  })

  it('rethrows transient errors so PowerSync retries', async () => {
    const sb = fakeSupabase(() => ({ code: 'PGRST000', message: 'network' }))
    const { db, complete } = fakeDb([{ op: UpdateType.PUT, table: 'accounts', id: 'a1', opData: {} }])
    await expect(new SupabaseConnector(sb.client, {}).uploadData(db)).rejects.toBeTruthy()
    expect(complete).not.toHaveBeenCalled()
  })

  it('does nothing when the queue is empty', async () => {
    const sb = fakeSupabase()
    const db = { getNextCrudTransaction: async () => null, execute: vi.fn() } as never
    await new SupabaseConnector(sb.client, {}).uploadData(db)
    expect(sb.calls).toEqual([])
  })
})

describe('SupabaseConnector.fetchCredentials', () => {
  it('null when sync not configured', async () =>
    expect(await new SupabaseConnector(fakeSupabase().client, {}).fetchCredentials()).toBeNull())
  it('returns endpoint + token', async () =>
    expect(
      await new SupabaseConnector(fakeSupabase().client, { powersyncUrl: 'https://x.powersync' }).fetchCredentials(),
    ).toMatchObject({ endpoint: 'https://x.powersync', token: 'tok' }))
})

describe('isPermanentError', () => {
  it.each([
    ['23514', true],
    ['23505', true],
    ['22P02', true],
    ['42501', true],
    ['P0001', true],
    ['PGRST000', false],
    ['08006', false],
    [undefined, false],
  ])('%s → %s', (code, want) => expect(isPermanentError(code)).toBe(want))
})
