import { z } from 'zod'

// Mirrors the Postgres CHECK constraints (supabase/migrations/*_schema.sql) so bad input is caught
// inline in the UI before it ever reaches the local database or the upload queue.

const id = z.uuid()
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
  }, 'Not a real date')
const amount = z.number().int('Must be a whole number of minor units').positive('Must be greater than 0')
const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Expected a 3-letter currency code')
const fxRate = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/, 'Expected a decimal rate like 121.4')

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'emi', 'lending_out', 'lending_in'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const transactionInput = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amount_minor: amount,
    account_id: id,
    to_account_id: id.nullish(),
    category_id: id.nullish(),
    party_id: id.nullish(),
    occurred_on: isoDate,
    occurred_at: z.iso.datetime(),
    note: z.string().max(500).nullish(),
    original_amount_minor: amount.nullish(),
    original_currency: currencyCode.nullish(),
    fx_rate: fxRate.nullish(),
    recurring_rule_id: id.nullish(),
    occurrence_date: isoDate.nullish(),
    loan_id: id.nullish(),
    installment_number: z.number().int().min(1).nullish(),
    lending_id: id.nullish(),
  })
  .superRefine((t, ctx) => {
    const need = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [path], message })
    }
    const has = (v: unknown) => v !== null && v !== undefined

    const isTransfer = t.type === 'transfer'
    need(isTransfer === has(t.to_account_id), 'to_account_id', isTransfer ? 'Pick the account to move money to' : 'Only transfers have a target account')
    if (isTransfer && t.to_account_id === t.account_id) need(false, 'to_account_id', 'Pick a different account')

    const needsCategory = t.type === 'expense' || t.type === 'income'
    need(needsCategory === has(t.category_id), 'category_id', needsCategory ? 'Pick a category' : 'This type has no category')

    const isEmi = t.type === 'emi'
    need(isEmi === has(t.loan_id), 'loan_id', isEmi ? 'EMI must belong to a loan' : 'Only EMIs link to a loan')
    need(isEmi === has(t.installment_number), 'installment_number', isEmi ? 'Missing installment number' : 'Only EMIs have an installment')

    const isLending = t.type === 'lending_out' || t.type === 'lending_in'
    need(isLending === has(t.lending_id), 'lending_id', isLending ? 'Pick who this is with' : 'Only lending movements link to a lending')

    const fx = [t.original_amount_minor, t.original_currency, t.fx_rate].map(has)
    if (fx.some(Boolean) && !fx.every(Boolean)) {
      if (!fx[0]) need(false, 'original_amount_minor', 'Enter the original amount')
      if (!fx[1]) need(false, 'original_currency', 'Pick the original currency')
      if (!fx[2]) need(false, 'fx_rate', 'Enter the rate you got')
    }

    need(has(t.recurring_rule_id) === has(t.occurrence_date), 'occurrence_date', 'Recurring posts need an occurrence date')
  })
export type TransactionInput = z.infer<typeof transactionInput>

const name = (max: number) => z.string().trim().min(1, 'Required').max(max)

export const ACCOUNT_TYPES = ['cash', 'bank', 'mobile_wallet', 'card', 'savings'] as const
export const accountInput = z.object({
  name: name(60),
  type: z.enum(ACCOUNT_TYPES),
  opening_balance_minor: z.number().int().default(0),
  opening_date: isoDate.optional(),
  color: z.string().nullish(),
  icon: z.string().nullish(),
})
export type AccountInput = z.infer<typeof accountInput>

export const partyInput = z.object({
  name: name(80),
  kind: z.enum(['person', 'company']).default('person'),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +8801712345678')
    .nullish(),
  note: z.string().max(500).nullish(),
})
export type PartyInput = z.infer<typeof partyInput>
