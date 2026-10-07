import type { z } from 'zod'
import { atomic, type Executor } from './executor'
import { newId } from './ids'
import { createTransaction, normalizePartyInput, parse } from './mutations'
import { lendingInput, partyInput, type LendingInput } from './validators'

const now = () => new Date().toISOString()
const middayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12).toISOString()
}

/**
 * Records money lent to / borrowed from a person. With an account, the initial movement is a transaction
 * (lent → lending_out, borrowed → lending_in); "happened before Hisab" (account null) creates none.
 */
export async function createLending(ex: Executor, userId: string, input: LendingInput): Promise<string> {
  const l = parse(lendingInput, input)
  const id = newId()
  const ts = now()
  await ex.execute(
    `insert into lendings (id, user_id, party_id, direction, principal_minor, started_on, due_on, reminder_interval_days, note, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, l.party_id, l.direction, l.principal_minor, l.started_on, l.due_on ?? null, l.reminder_interval_days ?? null, l.note ?? null, ts, ts],
  )
  if (l.account_id) {
    await createTransaction(ex, userId, {
      type: l.direction === 'lent' ? 'lending_out' : 'lending_in',
      amount_minor: l.principal_minor,
      account_id: l.account_id,
      party_id: l.party_id,
      lending_id: id,
      note: l.note ?? null,
      occurred_on: l.started_on,
      occurred_at: middayOf(l.started_on),
    })
  }
  return id
}

/** A (partial) repayment: they pay me back (lent) or I pay them back (borrowed). */
export async function recordRepayment(
  ex: Executor,
  userId: string,
  lendingId: string,
  r: { amount_minor: number; account_id: string; occurred_on: string; note?: string | null },
): Promise<string> {
  const l = await ex.getOptional<{ direction: 'lent' | 'borrowed'; party_id: string }>('select direction, party_id from lendings where id = ? and deleted_at is null', [lendingId])
  if (!l) throw new Error('Lending not found')
  return createTransaction(ex, userId, {
    type: l.direction === 'lent' ? 'lending_in' : 'lending_out',
    amount_minor: r.amount_minor,
    account_id: r.account_id,
    party_id: l.party_id,
    lending_id: lendingId,
    note: r.note ?? null,
    occurred_on: r.occurred_on,
    occurred_at: middayOf(r.occurred_on),
  })
}

export async function closeLending(ex: Executor, id: string, closed: boolean): Promise<void> {
  const ts = now()
  await ex.execute('update lendings set closed_at = ?, updated_at = ? where id = ?', [closed ? ts : null, ts, id])
}

export async function updateLendingDue(ex: Executor, id: string, dueOn: string | null): Promise<void> {
  await ex.execute('update lendings set due_on = ?, updated_at = ? where id = ?', [dueOn, now(), id])
}

/** Remembers that the user opened WhatsApp/SMS with a reminder (shown in the person's history). */
export async function logReminderSent(ex: Executor, userId: string, lendingId: string, channel: 'whatsapp' | 'sms' | 'other', sentAt = now()): Promise<void> {
  const ts = now()
  await ex.execute('insert into lending_reminders_sent (id, user_id, lending_id, channel, sent_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)', [
    newId(),
    userId,
    lendingId,
    channel,
    sentAt,
    ts,
    ts,
  ])
}

export async function updateParty(ex: Executor, id: string, input: z.input<typeof partyInput>): Promise<void> {
  const p = parse(partyInput, normalizePartyInput(input))
  await ex.execute('update parties set name = ?, kind = ?, phone = ?, note = ?, updated_at = ? where id = ?', [p.name, p.kind, p.phone ?? null, p.note ?? null, now(), id])
}

/**
 * A repayment from/to a person (not a single lending): spread over their open lendings in one
 * direction, oldest first; anything beyond the total lands on the newest so no money is lost.
 */
export async function recordPersonRepayment(
  ex: Executor,
  userId: string,
  partyId: string,
  direction: 'lent' | 'borrowed',
  r: { amount_minor: number; account_id: string; occurred_on: string },
): Promise<string[]> {
  if (!Number.isInteger(r.amount_minor) || r.amount_minor <= 0) throw new Error('Enter the amount')
  return atomic(ex, async (tx) => {
    const open = await tx.getAll<{ id: string; outstanding: number }>(
      `select l.id, max(0, l.principal_minor - coalesce((select sum(t.amount_minor) from transactions t
         where t.lending_id = l.id and t.deleted_at is null
           and t.type = case l.direction when 'lent' then 'lending_in' else 'lending_out' end), 0)) as outstanding
       from lendings l where l.party_id = ? and l.direction = ? and l.deleted_at is null and l.closed_at is null
       order by l.started_on, l.created_at`,
      [partyId, direction],
    )
    if (open.length === 0) throw new Error('Nothing is owed')
    const ids: string[] = []
    let left = r.amount_minor
    for (let i = 0; i < open.length && left > 0; i++) {
      const last = i === open.length - 1
      const part = last ? left : Math.min(left, open[i]!.outstanding)
      if (part <= 0) continue
      ids.push(await recordRepayment(tx, userId, open[i]!.id, { ...r, amount_minor: part }))
      left -= part
    }
    return ids
  })
}

/** Deletes a lending together with its money movements (soft; restorable). */
export async function deleteLending(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await atomic(ex, async (tx) => {
    await tx.execute('update lendings set deleted_at = ?, updated_at = ? where id = ?', [ts, ts, id])
    await tx.execute('update transactions set deleted_at = ?, updated_at = ? where lending_id = ? and deleted_at is null', [ts, ts, id])
  })
}

/** Undo of deleteLending: brings back the lending and the movements deleted with it. */
export async function restoreLending(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await atomic(ex, async (tx) => {
    const l = await tx.getOptional<{ deleted_at: string | null }>('select deleted_at from lendings where id = ?', [id])
    if (!l?.deleted_at) return
    await tx.execute('update transactions set deleted_at = null, updated_at = ? where lending_id = ? and deleted_at = ?', [ts, id, l.deleted_at])
    await tx.execute('update lendings set deleted_at = null, updated_at = ? where id = ?', [ts, id])
  })
}

/** Fixes amount / dates; the initial money movement (if any) is corrected to match. */
export async function updateLending(
  ex: Executor,
  id: string,
  u: { principal_minor: number; started_on: string; due_on: string | null; note?: string | null },
): Promise<void> {
  if (!Number.isInteger(u.principal_minor) || u.principal_minor <= 0) throw new Error('Enter the amount')
  if (u.due_on && u.due_on < u.started_on) throw new Error('Due date is before the start date')
  const ts = now()
  await atomic(ex, async (tx) => {
    const l = await tx.getOptional<{ direction: 'lent' | 'borrowed' }>('select direction from lendings where id = ?', [id])
    if (!l) throw new Error('Lending not found')
    await tx.execute('update lendings set principal_minor = ?, started_on = ?, due_on = ?, note = ?, updated_at = ? where id = ?', [
      u.principal_minor,
      u.started_on,
      u.due_on,
      u.note ?? null,
      ts,
      id,
    ])
    const initialType = l.direction === 'lent' ? 'lending_out' : 'lending_in'
    const first = await tx.getOptional<{ id: string }>(
      'select id from transactions where lending_id = ? and type = ? and deleted_at is null order by occurred_on, created_at limit 1',
      [id, initialType],
    )
    if (first)
      await tx.execute('update transactions set amount_minor = ?, occurred_on = ?, occurred_at = ?, updated_at = ? where id = ?', [
        u.principal_minor,
        u.started_on,
        middayOf(u.started_on),
        ts,
        first.id,
      ])
  })
}
