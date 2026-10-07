import { beforeEach, describe, expect, it } from 'vitest'
import { createAccount, createParty, softDeleteTransaction } from '../src/mutations'
import { closeLending, createLending, logReminderSent, recordRepayment, updateParty } from '../src/people-mutations'
import { QL, type LendingView, type PersonWithBalance } from '../src/people-queries'
import { Q, type AccountWithBalance } from '../src/queries'
import { createTestDb } from './sqlite'

const USER = '0192f5a0-0000-7000-8000-0000000000aa'
let db: ReturnType<typeof createTestDb>
let cash: string
let rafiq: string
let karim: string

beforeEach(async () => {
  db = createTestDb()
  cash = await createAccount(db, USER, { name: 'Cash', type: 'cash', opening_balance_minor: 5000000 })
  rafiq = await createParty(db, USER, { name: 'Rafiq', kind: 'person', phone: '+8801712345621' })
  karim = await createParty(db, USER, { name: 'Karim', kind: 'person' })
})

const cashBalance = async () => (await db.getAll<AccountWithBalance>(Q.accountsWithBalance)).find((a) => a.id === cash)!.balance_minor
const people = () => db.getAll<PersonWithBalance>(QL.peopleWithBalances)

describe('lendings', () => {
  it('lending from an account moves money out; outstanding is the principal', async () => {
    await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 1500000, started_on: '2026-09-02', account_id: cash })
    expect(await cashBalance()).toBe(5000000 - 1500000)
    expect(await people()).toEqual([expect.objectContaining({ id: rafiq, owed_to_me: 1500000, i_owe: 0 }), expect.objectContaining({ id: karim, owed_to_me: 0, i_owe: 0 })])
  })

  it('"happened before Hisab" creates no transaction', async () => {
    await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 1000000, started_on: '2026-01-01', account_id: null })
    expect(await cashBalance()).toBe(5000000)
    expect(await db.getAll('select id from transactions')).toEqual([])
    expect((await people())[0]).toMatchObject({ owed_to_me: 1000000 })
  })

  it('partial repayment reduces outstanding and adds to the account; deleting it re-opens', async () => {
    const id = await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 1500000, started_on: '2026-09-02', account_id: cash })
    const repay = await recordRepayment(db, USER, id, { amount_minor: 500000, account_id: cash, occurred_on: '2026-09-20' })
    expect(await cashBalance()).toBe(5000000 - 1500000 + 500000)
    const [l] = await db.getAll<LendingView>(QL.lendingsForParty, [rafiq])
    expect(l).toMatchObject({ principal_minor: 1500000, repaid: 500000 })
    await softDeleteTransaction(db, repay)
    expect((await db.getAll<LendingView>(QL.lendingsForParty, [rafiq]))[0]!.repaid).toBe(0)
  })

  it('borrowed: money comes in, paying back goes out', async () => {
    const id = await createLending(db, USER, { party_id: karim, direction: 'borrowed', principal_minor: 500000, started_on: '2026-10-01', account_id: cash })
    expect(await cashBalance()).toBe(5500000)
    await recordRepayment(db, USER, id, { amount_minor: 200000, account_id: cash, occurred_on: '2026-10-05' })
    expect(await cashBalance()).toBe(5300000)
    expect((await people()).find((p) => p.id === karim)).toMatchObject({ i_owe: 300000, owed_to_me: 0 })
  })

  it('over-payment never shows a negative balance; closed lendings drop out of open lists', async () => {
    const id = await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 100000, started_on: '2026-10-01', account_id: null })
    await recordRepayment(db, USER, id, { amount_minor: 150000, account_id: cash, occurred_on: '2026-10-02' })
    expect((await people())[0]).toMatchObject({ owed_to_me: 0 })
    await closeLending(db, id, true)
    expect(await db.getAll(QL.openLendings)).toEqual([])
  })

  it('validation: due date before start, zero principal', async () => {
    await expect(createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 0, started_on: '2026-10-01', account_id: null })).rejects.toThrow()
    await expect(
      createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 1, started_on: '2026-10-05', due_on: '2026-10-01', account_id: null }),
    ).rejects.toThrow()
  })

  it('repayment cannot be zero and needs an account', async () => {
    const id = await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 100, started_on: '2026-10-01', account_id: null })
    await expect(recordRepayment(db, USER, id, { amount_minor: 0, account_id: cash, occurred_on: '2026-10-02' })).rejects.toThrow()
  })
})

describe('reminders and party history', () => {
  it('logs reminders and lists them newest first', async () => {
    const id = await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 100, started_on: '2026-10-01', account_id: null })
    await logReminderSent(db, USER, id, 'whatsapp', '2026-10-03T05:00:00.000Z')
    await logReminderSent(db, USER, id, 'sms', '2026-10-05T05:00:00.000Z')
    expect((await db.getAll<{ channel: string }>(QL.remindersForParty, [rafiq])).map((r) => r.channel)).toEqual(['sms', 'whatsapp'])
  })

  it('party history includes lending movements', async () => {
    const id = await createLending(db, USER, { party_id: rafiq, direction: 'lent', principal_minor: 1500000, started_on: '2026-09-02', account_id: cash })
    await recordRepayment(db, USER, id, { amount_minor: 500000, account_id: cash, occurred_on: '2026-09-20' })
    const rows = await db.getAll<{ type: string; amount_minor: number }>(QL.partyHistory, [rafiq])
    expect(rows.map((r) => [r.type, r.amount_minor])).toEqual([
      ['lending_in', 500000],
      ['lending_out', 1500000],
    ])
  })

  it('updateParty normalizes a local phone number', async () => {
    await updateParty(db, karim, { name: 'Karim', kind: 'person', phone: '01812-345678' })
    expect(await db.getOptional('select phone from parties where id = ?', [karim])).toEqual({ phone: '+8801812345678' })
  })
})
