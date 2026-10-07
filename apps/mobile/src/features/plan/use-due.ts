import { addDays, dueOccurrences, isoInstant, loanProgress, localDate, type LoanProgress } from '@hisab/core'
import { groupOccurrences, QP, type LoanWithPayments, type RecurringRuleView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useMemo } from 'react'

export type DueItem =
  | { key: string; kind: 'recurring'; date: string; overdue: boolean; rule: RecurringRuleView }
  | { key: string; kind: 'emi'; date: string; overdue: boolean; loan: LoanWithPayments; progress: LoanProgress }

const LOOKAHEAD_DAYS = 7

/** Everything needing attention in the next 7 days or overdue (spec §6.5 "Due soon"), oldest first. */
export function useDueItems(today: string, timeZone: string): DueItem[] {
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)

  return useMemo(() => {
    const postedBy = groupOccurrences(posted)
    const skippedBy = groupOccurrences(skipped)
    const items: DueItem[] = []

    for (const rule of rules) {
      if (rule.mode !== 'confirm') continue
      const due = dueOccurrences(
        { ...rule, created_on: localDate(new Date(isoInstant(rule.created_at)), timeZone), paused: Boolean(rule.paused_at) },
        postedBy.get(rule.id) ?? new Set(),
        skippedBy.get(rule.id) ?? new Set(),
        today,
        LOOKAHEAD_DAYS,
      )
      for (const d of due) items.push({ key: `r:${rule.id}:${d.date}`, kind: 'recurring', date: d.date, overdue: d.overdue, rule })
    }

    const horizon = addDays(today, LOOKAHEAD_DAYS)
    for (const loan of loans) {
      const progress = loanProgress(loan, loan.paid_count, loan.paid_amount, today)
      if (progress.nextDueDate && progress.nextDueDate <= horizon) {
        items.push({ key: `l:${loan.id}`, kind: 'emi', date: progress.nextDueDate, overdue: progress.isOverdue, loan, progress })
      }
    }

    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [rules, posted, skipped, loans, today, timeZone])
}
