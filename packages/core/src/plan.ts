import { addDays, addMonths, daysBetween, monthRange } from './dates'

/** Recurring rules, EMI loans and budgets — spec §6.3, §6.5, §6.6. */

export interface RecurrenceRule {
  frequency: 'weekly' | 'monthly' | 'yearly'
  interval: number
  anchor_date: string
  end_date?: string | null
}

/** n-th occurrence, always computed from the anchor so the 31st survives short months. */
function nth(rule: RecurrenceRule, n: number): string {
  const step = n * Math.max(1, rule.interval)
  if (rule.frequency === 'weekly') return addDays(rule.anchor_date, 7 * step)
  return addMonths(rule.anchor_date, rule.frequency === 'monthly' ? step : 12 * step)
}

/** Occurrence dates within [from, to] (inclusive), respecting `end_date`. */
export function occurrences(rule: RecurrenceRule, from: string, to: string): string[] {
  const out: string[] = []
  const last = rule.end_date && rule.end_date < to ? rule.end_date : to
  for (let n = 0; n < 10_000; n++) {
    const d = nth(rule, n)
    if (d > last) break
    if (d >= from) out.push(d)
  }
  return out
}

export interface DueRule extends RecurrenceRule {
  /** Local day the rule was created; earlier occurrences are never shown as due. */
  created_on: string
  paused: boolean
}

/** Unposted, unskipped occurrences up to `lookaheadDays` ahead (spec §6.5). */
export function dueOccurrences(
  rule: DueRule,
  posted: Set<string>,
  skipped: Set<string>,
  today: string,
  lookaheadDays = 7,
): { date: string; overdue: boolean }[] {
  if (rule.paused) return []
  const start = rule.anchor_date > rule.created_on ? rule.anchor_date : rule.created_on
  return occurrences(rule, start, addDays(today, lookaheadDays))
    .filter((d) => !posted.has(d) && !skipped.has(d))
    .map((date) => ({ date, overdue: date < today }))
}

export interface LoanTerms {
  emi_amount_minor: number
  total_installments: number
  first_due_date: string
  installments_paid_before: number
}

export interface LoanProgress {
  paid: number
  monthsLeft: number
  paidAmount: number
  remainingAmount: number
  nextDueDate: string | null
  isOverdue: boolean
  debtFreeBy: string | null
  /** Due date of installment n (1-based). */
  installmentDate: (n: number) => string
}

export function loanProgress(loan: LoanTerms, paidCount: number, paidAmountInApp: number, today: string): LoanProgress {
  const installmentDate = (n: number) => addMonths(loan.first_due_date, n - 1)
  const paid = loan.installments_paid_before + paidCount
  const monthsLeft = Math.max(0, loan.total_installments - paid)
  const nextDueDate = monthsLeft > 0 ? installmentDate(paid + 1) : null
  const isOverdue = nextDueDate !== null && nextDueDate < today

  let debtFreeBy: string | null = null
  if (monthsLeft > 0) {
    if (!isOverdue) debtFreeBy = installmentDate(paid + monthsLeft)
    else {
      // Overdue EMIs push the finish back: start from the first scheduled date on/after today.
      let n0 = paid + 1
      while (installmentDate(n0) < today) n0++
      debtFreeBy = installmentDate(n0 + monthsLeft - 1)
    }
  }

  return {
    paid,
    monthsLeft,
    paidAmount: loan.installments_paid_before * loan.emi_amount_minor + paidAmountInApp,
    remainingAmount: monthsLeft * loan.emi_amount_minor,
    nextDueDate,
    isOverdue,
    debtFreeBy,
    installmentDate,
  }
}

export function budgetProgress(spent: number, limit: number): { ratio: number; state: 'ok' | 'near' | 'over' } {
  const ratio = limit > 0 ? spent / limit : 0
  return { ratio, state: spent > limit ? 'over' : ratio >= 0.8 ? 'near' : 'ok' }
}

/** (overall budget − spent) ÷ days left in the month, today inclusive (spec §6.6). */
export function safeToSpendPerDay(limit: number, spent: number, today: string): number {
  const daysLeft = daysBetween(today, monthRange(today).end) + 1
  return Math.floor(Math.max(0, limit - spent) / daysLeft)
}
