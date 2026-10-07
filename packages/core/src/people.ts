/** Lending (money lent / borrowed between the owner and a person) — spec §6.4. */

export type LendingDirection = 'lent' | 'borrowed'
export type LendingStatus = 'open' | 'partly_paid' | 'overdue' | 'settled'

/**
 * `repaid` = Σ repayments (lending_in for lent, lending_out for borrowed). Over-payment is settled,
 * never a negative balance. Status is always derived, so deleting a repayment re-opens it.
 */
export function lendingStatus(
  l: { direction: LendingDirection; principal_minor: number; due_on: string | null; closed_at: string | null },
  repaid: number,
  today: string,
): { outstanding: number; status: LendingStatus } {
  const outstanding = Math.max(0, l.principal_minor - repaid)
  if (l.closed_at || outstanding === 0) return { outstanding: 0, status: 'settled' }
  if (l.due_on && l.due_on < today) return { outstanding, status: 'overdue' }
  return { outstanding, status: repaid > 0 ? 'partly_paid' : 'open' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

/** Polite default text; the user can edit it before sending (spec §6.4). */
export function reminderMessage(o: { name: string; amount: string; startedOn: string; direction: LendingDirection }): string {
  return o.direction === 'lent'
    ? `Hi ${o.name}, just a gentle reminder about the ${o.amount} from ${shortDate(o.startedOn)}. Let me know when it works for you. Thanks!`
    : `Hi ${o.name}, I haven’t forgotten the ${o.amount} from ${shortDate(o.startedOn)} — I’ll return it soon. Thanks for your patience!`
}

export function whatsappUrl(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

export function smsUrl(phoneE164: string, text: string): string {
  return `sms:${phoneE164}?body=${encodeURIComponent(text)}`
}

/** Normalizes common Bangladeshi and international formats to E.164, or null if it isn't a phone number. */
export function toE164(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const plus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  let out: string | null = null
  if (plus) out = `+${digits}`
  else if (digits.startsWith('880') && digits.length === 13) out = `+${digits}`
  else if (digits.startsWith('01') && digits.length === 11) out = `+880${digits.slice(1)}`
  return out && /^\+[1-9]\d{7,14}$/.test(out) ? out : null
}

/** Budget alert thresholds (80%, 100%) crossed by a spend going from `before` to `after` (spec §6.6). */
export function budgetThresholdsCrossed(before: number, after: number, limit: number): (80 | 100)[] {
  if (limit <= 0) return []
  return ([80, 100] as const).filter((t) => before * 100 < limit * t && after * 100 >= limit * t)
}
