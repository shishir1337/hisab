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

/** Columns tying a row to a recurring rule / loan / lending: an edit never changes them. */
const LINK_COLUMNS = new Set<string>(['recurring_rule_id', 'occurrence_date', 'loan_id', 'installment_number', 'lending_id'])
const EDITABLE_COLUMNS = TX_COLUMNS.filter((c) => !LINK_COLUMNS.has(c))

/**
 * Replaces the user-editable fields (fields not relevant to a changed type become NULL) and keeps the
 * row's links, so editing a posted salary/EMI never detaches it from its rule or loan.
 */
export async function updateTransaction(ex: Executor, id: string, input: TransactionDraft): Promise<void> {
  const links = await ex.getOptional<Record<string, unknown>>(
    'select recurring_rule_id, occurrence_date, loan_id, installment_number, lending_id from transactions where id = ?',
    [id],
  )
  const kept = Object.fromEntries(Object.entries(links ?? {}).filter(([, v]) => v !== null))
  // Validate the row as it will be stored (links included).
  const all = txValues({ ...input, ...kept } as TransactionDraft)
  const values = EDITABLE_COLUMNS.map((c) => all[TX_COLUMNS.indexOf(c)])
  await ex.execute(`update transactions set ${EDITABLE_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? where id = ?`, [...values, now(), id])
}

/**
 * Soft delete. Deleting a posted recurring occurrence also marks that occurrence skipped, so auto mode
 * won't post it again ("didn't come this month").
 */
export async function softDeleteTransaction(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await ex.execute('update transactions set deleted_at = ?, updated_at = ? where id = ?', [ts, ts, id])
  const row = await ex.getOptional<{ user_id: string; recurring_rule_id: string | null; occurrence_date: string | null }>(
    'select user_id, recurring_rule_id, occurrence_date from transactions where id = ?',
    [id],
  )
  if (!row?.recurring_rule_id || !row.occurrence_date) return
  const exists = await ex.getOptional('select id from recurring_skips where rule_id = ? and occurrence_date = ? and deleted_at is null', [
    row.recurring_rule_id,
    row.occurrence_date,
  ])
  if (exists) return
  await ex.execute('insert into recurring_skips (id, user_id, rule_id, occurrence_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', [
    newId(),
    row.user_id,
    row.recurring_rule_id,
    row.occurrence_date,
    ts,
    ts,
  ])
}

export async function restoreTransaction(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await ex.execute('update transactions set deleted_at = null, updated_at = ? where id = ?', [ts, id])
  const row = await ex.getOptional<{ recurring_rule_id: string | null; occurrence_date: string | null }>(
    'select recurring_rule_id, occurrence_date from transactions where id = ?',
    [id],
  )
  if (!row?.recurring_rule_id || !row.occurrence_date) return
  await ex.execute('update recurring_skips set deleted_at = ?, updated_at = ? where rule_id = ? and occurrence_date = ? and deleted_at is null', [
    ts,
    ts,
    row.recurring_rule_id,
    row.occurrence_date,
  ])
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

// ---------------------------------------------------------------- bulk (web Activity table)

/** Types the Activity table may bulk-edit; EMI and lending movements are managed from their loan / person. */
const BULK_TYPES = ['expense', 'income', 'transfer']

/** Soft-deletes the selected expense/income/transfer rows (others are skipped); returns how many. */
export async function bulkSoftDelete(ex: Executor, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await ex.getAll<{ id: string }>(
    `select id from transactions where id in (${ids.map(() => '?').join(', ')}) and type in ('expense', 'income', 'transfer') and deleted_at is null`,
    ids,
  )
  for (const { id } of rows) await softDeleteTransaction(ex, id)
  return rows.length
}

export async function bulkRestore(ex: Executor, ids: string[]): Promise<void> {
  for (const id of ids) await restoreTransaction(ex, id)
}

/** Like bulkRecategorize, but returns each changed row's previous category (for Undo). */
export async function bulkRecategorizeWithUndo(ex: Executor, ids: string[], categoryId: string): Promise<Record<string, string | null>> {
  const cat = await ex.getOptional<{ kind: string }>('select kind from categories where id = ?', [categoryId])
  if (!cat || ids.length === 0) return {}
  const before = await ex.getAll<{ id: string; category_id: string | null }>(
    `select id, category_id from transactions where id in (${ids.map(() => '?').join(', ')}) and type = ? and deleted_at is null`,
    [...ids, cat.kind],
  )
  await bulkRecategorize(ex, ids, categoryId)
  return Object.fromEntries(before.map((r) => [r.id, r.category_id]))
}

/** Restores categories from a { id → category_id } snapshot (Undo of a bulk recategorize). */
export async function bulkSetCategories(ex: Executor, map: Record<string, string | null>): Promise<void> {
  const ts = now()
  for (const [id, categoryId] of Object.entries(map)) await ex.execute('update transactions set category_id = ?, updated_at = ? where id = ?', [categoryId, ts, id])
}

/** Sets the category on the selected rows whose type matches the category's kind; returns how many changed. */
export async function bulkRecategorize(ex: Executor, ids: string[], categoryId: string): Promise<number> {
  const cat = await ex.getOptional<{ kind: 'income' | 'expense' }>('select kind from categories where id = ?', [categoryId])
  if (!cat || ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const matching = await ex.getAll<{ id: string }>(
    `select id from transactions where id in (${placeholders}) and type = ? and deleted_at is null`,
    [...ids, cat.kind],
  )
  const ts = now()
  for (const { id } of matching) await ex.execute('update transactions set category_id = ?, updated_at = ? where id = ?', [categoryId, ts, id])
  return matching.length
}
