import type { RecurringRuleView } from '@hisab/db'

const FREQ: Record<RecurringRuleView['frequency'], [string, string]> = {
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
}

/** "Every month", "Every 2 weeks"… */
export function cadence(r: Pick<RecurringRuleView, 'frequency' | 'interval'>): string {
  const [one, many] = FREQ[r.frequency]
  return r.interval === 1 ? `Every ${one}` : `Every ${r.interval} ${many}`
}
