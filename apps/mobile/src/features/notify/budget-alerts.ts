import { budgetThresholdsCrossed, formatMoney, monthRange, type Grouping } from '@hisab/core'
import { QP, type BudgetWithSpent, type Executor } from '@hisab/db'
import { notifyBudgetOnce } from '@/lib/notifications'

/**
 * After an expense is saved: alert once per month when its category budget or the overall budget
 * crosses 80% / 100% (spec §6.6, §6.8).
 */
export async function checkBudgetAlerts(
  db: Executor,
  expense: { category_id: string; amount_minor: number; occurred_on: string },
  currency: string,
  grouping: Grouping,
  hideAmounts = false,
): Promise<void> {
  const { start, end } = monthRange(expense.occurred_on)
  const budgets = await db.getAll<BudgetWithSpent>(QP.budgetsWithSpent, [start, end])
  for (const b of budgets) {
    if (b.category_id && b.category_id !== expense.category_id) continue
    const after = b.spent
    const before = after - expense.amount_minor
    for (const t of budgetThresholdsCrossed(before, after, b.amount_minor)) {
      const name = b.category_name ?? 'Monthly budget'
      const left = hideAmounts ? `${currency} ••••` : formatMoney(Math.max(0, b.amount_minor - after), currency, { grouping }).text
      await notifyBudgetOnce(
        `${b.category_id ?? 'overall'}:${start}:${t}`,
        t === 100 ? `${name}: budget used up` : `${name}: 80% of budget used`,
        t === 100 ? 'You’ve reached this month’s limit.' : `${left} left for the rest of the month.`,
      )
    }
  }
}
