import { dueOccurrences, localDate } from '@hisab/core'
import type { z } from 'zod'
import type { Executor } from './executor'
import { newId } from './ids'
import { createTransaction, ValidationError } from './mutations'
import { QP, type RecurringRuleView } from './plan-queries'
import { loanInput, recurringRuleInput, type LoanInput, type RecurringRuleInput } from './validators'

const now = () => new Date().toISOString()

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues)
  return r.data
}

/** Midday of a local day, as an ISO instant (posted occurrences have no meaningful time). */
const middayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12).toISOString()
}

// ---------------------------------------------------------------- recurring rules

const RULE_COLUMNS = ['type', 'amount_minor', 'account_id', 'to_account_id', 'category_id', 'party_id', 'note', 'frequency', 'interval', 'anchor_date', 'end_date', 'mode'] as const

function ruleValues(input: RecurringRuleInput) {
  const r = parse(recurringRuleInput, input) as Record<string, unknown> & { created_on?: string; type: string }
  if (r.type === 'transfer') r.category_id = null
  else r.to_account_id = null
  return { values: RULE_COLUMNS.map((c) => r[c] ?? null), createdOn: r.created_on }
}

export async function createRecurringRule(ex: Executor, userId: string, input: RecurringRuleInput): Promise<string> {
  const { values, createdOn } = ruleValues(input)
  const id = newId()
  const ts = now()
  const createdAt = createdOn ? `${createdOn}T00:00:00.000Z` : ts
  await ex.execute(
    `insert into recurring_rules (id, user_id, created_at, updated_at, ${RULE_COLUMNS.join(', ')}) values (?, ?, ?, ?, ${RULE_COLUMNS.map(() => '?').join(', ')})`,
    [id, userId, createdAt, ts, ...values],
  )
  return id
}

export async function updateRecurringRule(ex: Executor, id: string, input: RecurringRuleInput): Promise<void> {
  const { values } = ruleValues(input)
  await ex.execute(`update recurring_rules set ${RULE_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? where id = ?`, [...values, now(), id])
}

export async function pauseRecurringRule(ex: Executor, id: string, paused: boolean): Promise<void> {
  const ts = now()
  await ex.execute('update recurring_rules set paused_at = ?, updated_at = ? where id = ?', [paused ? ts : null, ts, id])
}

export async function deleteRecurringRule(ex: Executor, id: string): Promise<void> {
  const ts = now()
  await ex.execute('update recurring_rules set deleted_at = ?, updated_at = ? where id = ?', [ts, ts, id])
}

/**
 * Records one occurrence as a transaction (optionally with an edited amount/account/day).
 * Idempotent: an occurrence that is already posted returns the existing transaction id.
 */
export async function postOccurrence(
  ex: Executor,
  userId: string,
  rule: Pick<RecurringRuleView, 'id' | 'type' | 'amount_minor' | 'account_id' | 'to_account_id' | 'category_id' | 'party_id' | 'note'>,
  date: string,
  override: { amount_minor?: number; account_id?: string; occurred_on?: string } = {},
): Promise<string> {
  const existing = await ex.getOptional<{ id: string }>(
    'select id from transactions where recurring_rule_id = ? and occurrence_date = ? and deleted_at is null',
    [rule.id, date],
  )
  if (existing) return existing.id
  const day = override.occurred_on ?? date
  return createTransaction(ex, userId, {
    type: rule.type,
    amount_minor: override.amount_minor ?? rule.amount_minor,
    account_id: override.account_id ?? rule.account_id,
    to_account_id: rule.type === 'transfer' ? rule.to_account_id : null,
    category_id: rule.type === 'transfer' ? null : rule.category_id,
    party_id: rule.party_id,
    note: rule.note,
    occurred_on: day,
    occurred_at: middayOf(day),
    recurring_rule_id: rule.id,
    occurrence_date: date,
  })
}

export async function skipOccurrence(ex: Executor, userId: string, ruleId: string, date: string): Promise<void> {
  const existing = await ex.getOptional('select id from recurring_skips where rule_id = ? and occurrence_date = ? and deleted_at is null', [ruleId, date])
  if (existing) return
  const ts = now()
  await ex.execute('insert into recurring_skips (id, user_id, rule_id, occurrence_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', [newId(), userId, ruleId, date, ts, ts])
}

export async function unskipOccurrence(ex: Executor, ruleId: string, date: string): Promise<void> {
  const ts = now()
  await ex.execute('update recurring_skips set deleted_at = ?, updated_at = ? where rule_id = ? and occurrence_date = ? and deleted_at is null', [ts, ts, ruleId, date])
}

export interface OccurrenceSets {
  posted: Map<string, Set<string>>
  skipped: Map<string, Set<string>>
}

export function groupOccurrences(rows: { rule_id: string; occurrence_date: string }[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const r of rows) {
    const s = m.get(r.rule_id) ?? new Set<string>()
    s.add(r.occurrence_date)
    m.set(r.rule_id, s)
  }
  return m
}

/** Posts every due occurrence (≤ today) of active auto-mode rules. Returns how many were posted. */
export async function postDueAutoRules(ex: Executor, userId: string, today: string, timeZone = 'UTC'): Promise<number> {
  const rules = (await ex.getAll<RecurringRuleView>(QP.recurringRules)).filter((r) => r.mode === 'auto' && !r.paused_at)
  if (rules.length === 0) return 0
  const posted = groupOccurrences(await ex.getAll(QP.postedOccurrences))
  const skipped = groupOccurrences(await ex.getAll(QP.skippedOccurrences))
  let count = 0
  for (const r of rules) {
    const due = dueOccurrences(
      { ...r, created_on: localDate(new Date(r.created_at), timeZone), paused: false },
      posted.get(r.id) ?? new Set(),
      skipped.get(r.id) ?? new Set(),
      today,
      0,
    )
    for (const d of due) {
      await postOccurrence(ex, userId, r, d.date)
      count++
    }
  }
  return count
}

// ---------------------------------------------------------------- loans

const LOAN_COLUMNS = ['name', 'party_id', 'emi_amount_minor', 'total_installments', 'first_due_date', 'installments_paid_before', 'default_account_id', 'note'] as const

export async function createLoan(ex: Executor, userId: string, input: LoanInput): Promise<string> {
  const l = parse(loanInput, input) as Record<string, unknown>
  const id = newId()
  const ts = now()
  await ex.execute(
    `insert into loans (id, user_id, created_at, updated_at, ${LOAN_COLUMNS.join(', ')}) values (?, ?, ?, ?, ${LOAN_COLUMNS.map(() => '?').join(', ')})`,
    [id, userId, ts, ts, ...LOAN_COLUMNS.map((c) => l[c] ?? null)],
  )
  return id
}

export async function updateLoan(ex: Executor, id: string, input: LoanInput): Promise<void> {
  const l = parse(loanInput, input) as Record<string, unknown>
  await ex.execute(`update loans set ${LOAN_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? where id = ?`, [...LOAN_COLUMNS.map((c) => l[c] ?? null), now(), id])
}

export async function closeLoan(ex: Executor, id: string, closed: boolean): Promise<void> {
  const ts = now()
  await ex.execute('update loans set closed_at = ?, updated_at = ? where id = ?', [closed ? ts : null, ts, id])
}

/** Serializes concurrent "mark paid" taps per loan so a double tap can't create two installments. */
const emiLocks = new Map<string, Promise<unknown>>()

export async function markEmiPaid(
  ex: Executor,
  userId: string,
  loanId: string,
  opts: { occurred_on: string; account_id?: string; amount_minor?: number },
): Promise<string> {
  const prev = emiLocks.get(loanId) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(async () => {
    const loan = await ex.getOptional<{ emi_amount_minor: number; total_installments: number; installments_paid_before: number; default_account_id: string | null }>(
      'select emi_amount_minor, total_installments, installments_paid_before, default_account_id from loans where id = ? and deleted_at is null',
      [loanId],
    )
    if (!loan) throw new Error('Loan not found')
    const last = await ex.getOptional<{ n: number | null }>("select max(installment_number) as n from transactions where loan_id = ? and type = 'emi' and deleted_at is null", [loanId])
    const next = Math.max(loan.installments_paid_before, last?.n ?? 0) + 1
    if (next > loan.total_installments) throw new Error('This loan is already fully paid')
    const accountId = opts.account_id ?? loan.default_account_id
    if (!accountId) throw new Error('Pick the account the EMI was paid from')
    return createTransaction(ex, userId, {
      type: 'emi',
      amount_minor: opts.amount_minor ?? loan.emi_amount_minor,
      account_id: accountId,
      loan_id: loanId,
      installment_number: next,
      occurred_on: opts.occurred_on,
      occurred_at: middayOf(opts.occurred_on),
    })
  })
  emiLocks.set(loanId, run)
  try {
    return await run
  } finally {
    if (emiLocks.get(loanId) === run) emiLocks.delete(loanId)
  }
}

// ---------------------------------------------------------------- budgets

/** One active budget per category (null = overall monthly budget); setting again updates it. */
export async function setBudget(ex: Executor, userId: string, categoryId: string | null, amountMinor: number): Promise<void> {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error('Budget must be greater than 0')
  const existing = await ex.getOptional<{ id: string }>(
    'select id from budgets where deleted_at is null and coalesce(category_id, \'\') = coalesce(?, \'\')',
    [categoryId],
  )
  const ts = now()
  if (existing) await ex.execute('update budgets set amount_minor = ?, updated_at = ? where id = ?', [amountMinor, ts, existing.id])
  else
    await ex.execute('insert into budgets (id, user_id, category_id, amount_minor, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', [
      newId(),
      userId,
      categoryId,
      amountMinor,
      ts,
      ts,
    ])
}

export async function removeBudget(ex: Executor, categoryId: string | null): Promise<void> {
  const ts = now()
  await ex.execute("update budgets set deleted_at = ?, updated_at = ? where deleted_at is null and coalesce(category_id, '') = coalesce(?, '')", [ts, ts, categoryId])
}
