import { toE164 } from '@hisab/core'
import type { z } from 'zod'
import type { Executor } from './executor'
import { newId } from './ids'
import { accountInput, partyInput, transactionInput, type AccountInput, type PartyInput } from './validators'

/** Thrown before anything is written; `fields` drive inline errors in the UI. */
export class ValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    this.name = 'ValidationError'
  }
  get fields(): string[] {
    return [...new Set(this.issues.map((i) => i.path.join('.')))]
  }
  messageFor(field: string): string | undefined {
    return this.issues.find((i) => i.path.join('.') === field)?.message
  }
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues)
  return r.data
}

const now = () => new Date().toISOString()

/** Every mutable transaction column; anything the input omits is written as NULL (full replace). */
const TX_COLUMNS = [
  'type',
  'amount_minor',
  'account_id',
  'to_account_id',
  'category_id',
  'party_id',
  'occurred_on',
  'occurred_at',
  'note',
  'original_amount_minor',
  'original_currency',
  'fx_rate',
  'recurring_rule_id',
  'occurrence_date',
  'loan_id',
  'installment_number',
  'lending_id',
] as const

export type TransactionDraft = z.input<typeof transactionInput>

function txValues(input: TransactionDraft): unknown[] {
  const t = parse(transactionInput, input) as Record<string, unknown>
  if (typeof t.note === 'string' && t.note.trim() === '') t.note = null
  return TX_COLUMNS.map((c) => t[c] ?? null)
}

export async function createTransaction(ex: Executor, userId: string, input: TransactionDraft): Promise<string> {
  const values = txValues(input)
  const id = newId()
  const ts = now()
  await ex.execute(
    `insert into transactions (id, user_id, created_at, updated_at, ${TX_COLUMNS.join(', ')})
     values (?, ?, ?, ?, ${TX_COLUMNS.map(() => '?').join(', ')})`,
    [id, userId, ts, ts, ...values],
  )
  return id
}

/** Full replace: columns not relevant to the (possibly changed) type become NULL. */
export async function updateTransaction(ex: Executor, id: string, input: TransactionDraft): Promise<void> {
  const values = txValues(input)
  await ex.execute(`update transactions set ${TX_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? where id = ?`, [
    ...values,
    now(),
    id,
  ])
}

export async function softDeleteTransaction(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await ex.execute('update transactions set deleted_at = ?, updated_at = ? where id = ?', [ts, ts, id])
}

export async function restoreTransaction(ex: Executor, id: string): Promise<void> {
  await ex.execute('update transactions set deleted_at = null, updated_at = ? where id = ?', [now(), id])
}

export async function createAccount(ex: Executor, userId: string, input: z.input<typeof accountInput>): Promise<string> {
  const a: AccountInput = parse(accountInput, input)
  const id = newId()
  const ts = now()
  const order = await ex.getOptional<{ n: number }>('select coalesce(max(sort_order), 0) + 1 as n from accounts')
  await ex.execute(
    `insert into accounts (id, user_id, name, type, opening_balance_minor, opening_date, color, icon, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, a.name, a.type, a.opening_balance_minor, a.opening_date ?? ts.slice(0, 10), a.color ?? null, a.icon ?? null, order?.n ?? 1, ts, ts],
  )
  return id
}

export async function updateAccount(ex: Executor, id: string, input: z.input<typeof accountInput>): Promise<void> {
  const a: AccountInput = parse(accountInput, input)
  await ex.execute(
    'update accounts set name = ?, type = ?, opening_balance_minor = ?, color = ?, icon = ?, updated_at = ? where id = ?',
    [a.name, a.type, a.opening_balance_minor, a.color ?? null, a.icon ?? null, now(), id],
  )
}

export async function archiveAccount(ex: Executor, id: string, archived: boolean): Promise<void> {
  const ts = now()
  await ex.execute('update accounts set archived_at = ?, updated_at = ? where id = ?', [archived ? ts : null, ts, id])
}

/** Accepts local formats ("01712-345678") and stores E.164; an unrecognizable number is a validation error. */
export function normalizePartyInput<T extends { phone?: string | null }>(input: T): T {
  if (!input.phone || !input.phone.trim()) return { ...input, phone: null }
  return { ...input, phone: toE164(input.phone) ?? input.phone }
}

export async function createParty(ex: Executor, userId: string, input: z.input<typeof partyInput>): Promise<string> {
  const p: PartyInput = parse(partyInput, normalizePartyInput(input))
  const id = newId()
  const ts = now()
  await ex.execute(
    'insert into parties (id, user_id, name, kind, phone, note, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, p.name, p.kind, p.phone ?? null, p.note ?? null, ts, ts],
  )
  return id
}
