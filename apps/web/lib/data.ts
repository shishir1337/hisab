'use client'

import { computeDueItems, QP, type DueItem, type LoanWithPayments, type RecurringRuleView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useMemo } from 'react'

/** Live "Due soon" items (shared logic with mobile: @hisab/db computeDueItems). */
export function useDueItems(today: string, timeZone: string): DueItem[] {
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  return useMemo(() => computeDueItems({ rules, posted, skipped, loans }, today, timeZone), [rules, posted, skipped, loans, today, timeZone])
}
