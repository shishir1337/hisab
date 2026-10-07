'use client'

import { computeDueItems, Q, QP, type CategoryOption, type DueItem, type LoanWithPayments, type RecurringRuleView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useMemo, useSyncExternalStore } from 'react'

/** Live "Due soon" items (shared logic with mobile: @hisab/db computeDueItems). */
export function useDueItems(today: string, timeZone: string): DueItem[] {
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  return useMemo(() => computeDueItems({ rules, posted, skipped, loans }, today, timeZone), [rules, posted, skipped, loans, today, timeZone])
}

/** Category id → icon / tint, for screens whose rows only carry a category id or name. */
export function useCategoryMeta(): Map<string, { icon: string | null; color: string | null }> {
  const { data: expense } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: income } = useQuery<CategoryOption>(Q.categories, ['income'])
  return useMemo(() => new Map([...expense, ...income].map((c) => [c.id, { icon: c.icon, color: c.color }])), [expense, income])
}

const subscribeNoop = () => () => {}
const coarse = () => window.matchMedia('(pointer: coarse)').matches
/** True on touch-first devices (phones, tablets): say "Tap +" rather than "Press N". */
export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribeNoop, coarse, () => false)
}
