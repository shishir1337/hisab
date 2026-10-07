import { describe, expect, it } from 'vitest'
import { clearIssues, describeIssue, discardIssue, saveProfile } from '../src/profile'
import { Q } from '../src/queries'
import { createTestDb } from './sqlite'

const U = '0192f5a0-0000-7000-8000-0000000000aa'

describe('saveProfile', () => {
  it('creates the row (id = user id) before the first sync, then updates it', async () => {
    const db = createTestDb()
    await saveProfile(db, U, { base_currency: 'USD', number_grouping: 'western' })
    await saveProfile(db, U, { display_name: 'Amaiz' })
    const rows = await db.getAll<Record<string, unknown>>(Q.profile)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: U, user_id: U, base_currency: 'USD', number_grouping: 'western', display_name: 'Amaiz' })
  })
  it('before the first sync, inserts only the patched columns (no defaults that would reset the server row)', async () => {
    const db = createTestDb()
    await saveProfile(db, U, { hide_amounts: true })
    const row = (await db.getAll<Record<string, unknown>>(Q.profile))[0]!
    expect(row).toMatchObject({ id: U, user_id: U, hide_amounts: 1, base_currency: null, number_grouping: null, timezone: null, app_lock_enabled: null })
  })
  it('booleans are stored as 0/1 locally', async () => {
    const db = createTestDb()
    await saveProfile(db, U, { hide_amounts: true })
    expect((await db.getAll<{ hide_amounts: number }>(Q.profile))[0]!.hide_amounts).toBe(1)
  })
  it('rejects invalid values', async () => {
    const db = createTestDb()
    await expect(saveProfile(db, U, { base_currency: 'taka' as never })).rejects.toThrow()
    await expect(saveProfile(db, U, { timezone: 'Mars/Base' })).rejects.toThrow()
    await expect(saveProfile(db, U, { nudge_time: '25:00' })).rejects.toThrow()
  })
})

describe('upload issues', () => {
  it('discard removes only that issue; clear removes all', async () => {
    const db = createTestDb()
    await db.execute("insert into upload_issues (id, table_name, row_id, op, code, message, payload, created_at) values ('i1','transactions','t1','PUT','23514','bad','{}','2026-10-08T00:00:00Z'), ('i2','accounts','a1','PUT','23514','bad','{}','2026-10-08T00:00:00Z')")
    await discardIssue(db, 'i1')
    expect((await db.getAll<{ id: string }>(Q.uploadIssues)).map((r) => r.id)).toEqual(['i2'])
    await clearIssues(db)
    expect(await db.getAll(Q.uploadIssues)).toEqual([])
  })
})

describe('describeIssue', () => {
  it('names what was refused so the user can re-enter it', () => {
    expect(describeIssue({ table_name: 'transactions', op: 'PUT', payload: '{"note":"Lunch","occurred_on":"2026-10-08"}' })).toBe('New transaction · Lunch · 2026-10-08')
    expect(describeIssue({ table_name: 'accounts', op: 'PATCH', payload: '{"name":"City Bank"}' })).toBe('Edited account · City Bank')
    expect(describeIssue({ table_name: 'weird', op: 'X', payload: 'not json' })).toBe('weird')
  })
})
