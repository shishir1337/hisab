import type { z } from 'zod'
import type { Executor } from './executor'
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
