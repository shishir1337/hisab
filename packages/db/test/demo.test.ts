import { describe, expect, it } from 'vitest'
import { seedDemoData } from '../src/demo'
import { Q } from '../src/queries'
import { createTestDb } from './sqlite'

const U = '0192f5a0-0000-7000-8000-0000000000dd'

describe('seedDemoData', () => {
  it('fills an empty database once, with valid data', async () => {
    const db = createTestDb()
    expect(await seedDemoData(db, U, '2026-10-08')).toBe(true)
    expect((await db.getAll(Q.activeAccounts)).length).toBe(4)
    const n = await db.getOptional<{ n: number }>('select count(*) as n from transactions')
    expect(n!.n).toBeGreaterThan(100)
    expect(await seedDemoData(db, U, '2026-10-08')).toBe(false)
  })
})
