import { addDays, dueOccurrences, isoInstant, loanProgress, localDate, type LoanProgress } from '@hisab/core'
import { groupOccurrences } from './plan-mutations'
import type { LoanWithPayments, RecurringRuleView } from './plan-queries'

export type DueItem =
  | { key: string; kind: 'recurring'; date: string; overdue: boolean; rule: RecurringRuleView }
  | { key: string; kind: 'emi'; date: string; overdue: boolean; loan: LoanWithPayments; progress: LoanProgress }

const LOOKAHEAD_DAYS = 7
const MAX_PER_RULE = 3

/** Everything needing attention in the next 7 days or overdue (spec §6.5 "Due soon"), oldest first. */
export function computeDueItems(
  input: {
    rules: RecurringRuleView[]
    posted: { rule_id: string; occurrence_date: string }[]
    skipped: { rule_id: string; occurrence_date: string }[]
    loans: LoanWithPayments[]
  },
  today: string,
  timeZone: string,
): DueItem[] {
  const postedBy = groupOccurrences(input.posted)
  const skippedBy = groupOccurrences(input.skipped)
  const items: DueItem[] = []
  for (const rule of input.rules) {
    if (rule.mode !== 'confirm') continue
    const due = dueOccurrences(
      { ...rule, created_on: localDate(new Date(isoInstant(rule.created_at)), timeZone), paused: Boolean(rule.paused_at) },
      postedBy.get(rule.id) ?? new Set(),
      skippedBy.get(rule.id) ?? new Set(),
      today,
      LOOKAHEAD_DAYS,
    )
    // A long-ignored weekly item shouldn't flood the list: show its 3 most recent.
    for (const d of due.slice(-MAX_PER_RULE)) items.push({ key: `r:${rule.id}:${d.date}`, kind: 'recurring', date: d.date, overdue: d.overdue, rule })
  }
  const horizon = addDays(today, LOOKAHEAD_DAYS)
  for (const loan of input.loans) {
    const progress = loanProgress(loan, loan.paid_count, loan.paid_amount, today)
    if (progress.nextDueDate && progress.nextDueDate <= horizon)
      items.push({ key: `l:${loan.id}`, kind: 'emi', date: progress.nextDueDate, overdue: progress.isOverdue, loan, progress })
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
