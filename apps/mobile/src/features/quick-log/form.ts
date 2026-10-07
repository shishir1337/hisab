import { convertFx, keypadFromMinor, keypadReducer, keypadToMinor, localDate, type KeypadKey } from '@hisab/core'
import type { TransactionDraft, TransactionView } from '@hisab/db'

/** Quick-log sheet form state (spec §7.3). Pure so it can be unit tested. */

export type QuickLogType = 'expense' | 'income' | 'transfer'

export interface FormState {
  type: QuickLogType
  keypad: string
  categoryId: string | null
  accountId: string | null
  toAccountId: string | null
  partyId: string | null
  day: string
  note: string
  fx: { currency: string; rate: string } | null
  editingId: string | null
  /** Original timestamp when editing, kept if the day is unchanged. */
  originalAt: string | null
  originalDay: string | null
}

export type FormAction =
  | { type: 'key'; key: KeypadKey }
  | { type: 'setType'; value: QuickLogType; otherAccountId?: string | null }
  | { type: 'setCategory'; id: string | null }
  | { type: 'setAccount'; id: string }
  | { type: 'setToAccount'; id: string }
  | { type: 'setParty'; id: string | null }
  | { type: 'setDay'; day: string }
  | { type: 'setNote'; value: string }
  | { type: 'toggleFx' }
  | { type: 'setFxCurrency'; value: string }
  | { type: 'setFxRate'; value: string }
  | { type: 'load'; tx: Pick<TransactionView, 'id' | 'type' | 'amount_minor' | 'account_id' | 'to_account_id' | 'category_id' | 'party_id' | 'occurred_on' | 'occurred_at' | 'note' | 'original_amount_minor' | 'original_currency' | 'fx_rate'> }
  | { type: 'reset'; today: string; accountId: string | null }

export function initialForm({ today, accountId }: { today: string; accountId: string | null }): FormState {
  return {
    type: 'expense',
    keypad: '',
    categoryId: null,
    accountId,
    toAccountId: null,
    partyId: null,
    day: today,
    note: '',
    fx: null,
    editingId: null,
    originalAt: null,
    originalDay: null,
  }
}

export function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case 'key':
      return { ...s, keypad: keypadReducer(s.keypad, a.key) }
    case 'setType':
      if (a.value === s.type) return s
      return {
        ...s,
        type: a.value,
        categoryId: null,
        partyId: a.value === 'transfer' ? null : s.partyId,
        fx: null,
        toAccountId: a.value === 'transfer' ? (a.otherAccountId ?? null) : null,
      }
    case 'setCategory':
      return { ...s, categoryId: a.id }
    case 'setAccount':
      return { ...s, accountId: a.id, toAccountId: s.toAccountId === a.id ? null : s.toAccountId }
    case 'setToAccount':
      return { ...s, toAccountId: a.id }
    case 'setParty':
      return { ...s, partyId: a.id }
    case 'setDay':
      return { ...s, day: a.day }
    case 'setNote':
      return { ...s, note: a.value }
    case 'toggleFx':
      if (s.type !== 'income') return s
      return { ...s, fx: s.fx ? null : { currency: 'USD', rate: '' } }
    case 'setFxCurrency':
      return s.fx ? { ...s, fx: { ...s.fx, currency: a.value.toUpperCase().slice(0, 3) } } : s
    case 'setFxRate':
      return s.fx ? { ...s, fx: { ...s.fx, rate: a.value.replace(/[^\d.]/g, '') } } : s
    case 'load': {
      const t = a.tx
      const fx = t.original_currency && t.fx_rate ? { currency: t.original_currency, rate: t.fx_rate } : null
      return {
        type: t.type === 'income' || t.type === 'transfer' ? t.type : 'expense',
        keypad: keypadFromMinor(fx && t.original_amount_minor ? t.original_amount_minor : t.amount_minor),
        categoryId: t.category_id,
        accountId: t.account_id,
        toAccountId: t.to_account_id,
        partyId: t.party_id,
        day: t.occurred_on,
        note: t.note ?? '',
        fx,
        editingId: t.id,
        originalAt: t.occurred_at,
        originalDay: t.occurred_on,
      }
    }
    case 'reset':
      return initialForm(a)
  }
}

export type DraftResult =
  | { ok: true; draft: Required<Pick<TransactionDraft, 'type' | 'amount_minor' | 'account_id' | 'occurred_on' | 'occurred_at'>> & TransactionDraft }
  | { ok: false; missing: 'amount' | 'category' | 'account' | 'toAccount' | 'rate' }

/** Midday local time of `day`, used when logging for a past/future day. */
function middayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

export function toDraft(s: FormState, now: Date, timeZone: string): DraftResult {
  const typed = keypadToMinor(s.keypad)
  if (typed === null) return { ok: false, missing: 'amount' }
  if (!s.accountId) return { ok: false, missing: 'account' }
  if (s.type !== 'transfer' && !s.categoryId) return { ok: false, missing: 'category' }
  if (s.type === 'transfer' && (!s.toAccountId || s.toAccountId === s.accountId)) return { ok: false, missing: 'toAccount' }

  let amount = typed
  let fxFields = { original_amount_minor: null as number | null, original_currency: null as string | null, fx_rate: null as string | null }
  if (s.type === 'income' && s.fx) {
    if (!/^\d{1,12}(\.\d{1,8})?$/.test(s.fx.rate) || Number(s.fx.rate) <= 0) return { ok: false, missing: 'rate' }
    amount = convertFx(typed, s.fx.rate)
    fxFields = { original_amount_minor: typed, original_currency: s.fx.currency, fx_rate: s.fx.rate }
  }

  const occurredAt =
    s.originalAt && s.day === s.originalDay
      ? s.originalAt
      : s.day === localDate(now, timeZone)
        ? now.toISOString()
        : middayOf(s.day)

  const note = s.note.trim()
  return {
    ok: true,
    draft: {
      type: s.type,
      amount_minor: amount,
      account_id: s.accountId,
      category_id: s.type === 'transfer' ? null : s.categoryId,
      party_id: s.type === 'transfer' ? null : s.partyId,
      to_account_id: s.type === 'transfer' ? s.toAccountId : null,
      occurred_on: s.day,
      occurred_at: occurredAt,
      note: note === '' ? null : note,
      ...fxFields,
    },
  }
}
