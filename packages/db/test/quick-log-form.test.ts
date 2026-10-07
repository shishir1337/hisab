import { describe, it, expect } from 'vitest'
import { formReducer, initialForm, toDraft, type FormAction, type FormState } from '../src/quick-log-form'

const CASH = '0192f5a0-0000-7000-8000-0000000000a1'
const BANK = '0192f5a0-0000-7000-8000-0000000000a2'
const FOOD = '0192f5a0-0000-7000-8000-0000000000c1'
const SALARY = '0192f5a0-0000-7000-8000-0000000000c2'
const TODAY = '2026-10-07'
const NOW = new Date('2026-10-07T10:00:00.000Z')
const TZ = 'Asia/Dhaka'

const run = (...actions: FormAction[]): FormState =>
  actions.reduce(formReducer, initialForm({ today: TODAY, accountId: CASH }))

describe('formReducer', () => {
  it('starts as an expense today on the default account', () =>
    expect(run()).toMatchObject({ type: 'expense', keypad: '', day: TODAY, accountId: CASH, categoryId: null }))

  it('keys feed the calculator', () =>
    expect(run({ type: 'key', key: '1' }, { type: 'key', key: '4' }, { type: 'key', key: '5' }, { type: 'key', key: '0' }).keypad).toBe('1450'))

  it('switching type clears the category and fx (categories differ per kind)', () => {
    const s = run({ type: 'setCategory', id: FOOD }, { type: 'setType', value: 'income' })
    expect(s).toMatchObject({ type: 'income', categoryId: null })
  })

  it('switching to transfer picks a different target account when possible', () =>
    expect(run({ type: 'setType', value: 'transfer', otherAccountId: BANK })).toMatchObject({ toAccountId: BANK }))

  it('fx is only for income', () => {
    expect(run({ type: 'toggleFx' }).fx).toBeNull()
    expect(run({ type: 'setType', value: 'income' }, { type: 'toggleFx' }).fx).toEqual({ currency: 'USD', rate: '' })
  })
})

describe('toDraft', () => {
  it('needs an amount', () => expect(toDraft(run({ type: 'setCategory', id: FOOD }), NOW, TZ)).toEqual({ ok: false, missing: 'amount' }))
  it('needs a category for expenses', () =>
    expect(toDraft(run({ type: 'key', key: '5' }), NOW, TZ)).toEqual({ ok: false, missing: 'category' }))

  it('builds an expense logged now', () =>
    expect(toDraft(run({ type: 'key', key: '3' }, { type: 'key', key: '0' }, { type: 'setCategory', id: FOOD }, { type: 'setNote', value: ' Tea ' }), NOW, TZ)).toEqual({
      ok: true,
      draft: {
        type: 'expense',
        amount_minor: 3000,
        account_id: CASH,
        category_id: FOOD,
        party_id: null,
        to_account_id: null,
        occurred_on: TODAY,
        occurred_at: NOW.toISOString(),
        note: 'Tea',
        original_amount_minor: null,
        original_currency: null,
        fx_rate: null,
      },
    }))

  it('a past day is logged at midday of that day', () => {
    const r = toDraft(run({ type: 'key', key: '1' }, { type: 'setCategory', id: FOOD }, { type: 'setDay', day: '2026-10-05' }), NOW, TZ)
    expect(r.ok && r.draft.occurred_on).toBe('2026-10-05')
    expect(r.ok && new Date(r.draft.occurred_at).getHours()).toBe(12)
  })

  it('transfer needs a different target and has no category', () => {
    expect(toDraft(run({ type: 'setType', value: 'transfer', otherAccountId: null }, { type: 'key', key: '1' }), NOW, TZ)).toEqual({ ok: false, missing: 'toAccount' })
    const r = toDraft(run({ type: 'setType', value: 'transfer', otherAccountId: BANK }, { type: 'key', key: '1' }), NOW, TZ)
    expect(r.ok && r.draft).toMatchObject({ type: 'transfer', account_id: CASH, to_account_id: BANK, category_id: null })
  })

  it('foreign-currency income converts the typed amount at the rate', () => {
    const s = run(
      { type: 'setType', value: 'income' },
      { type: 'setCategory', id: SALARY },
      { type: 'toggleFx' },
      { type: 'key', key: '5' },
      { type: 'key', key: '0' },
      { type: 'key', key: '0' },
      { type: 'setFxRate', value: '121.4' },
    )
    const r = toDraft(s, NOW, TZ)
    expect(r.ok && r.draft).toMatchObject({ amount_minor: 6070000, original_amount_minor: 50000, original_currency: 'USD', fx_rate: '121.4' })
  })

  it('foreign-currency income needs a rate', () => {
    const s = run({ type: 'setType', value: 'income' }, { type: 'setCategory', id: SALARY }, { type: 'toggleFx' }, { type: 'key', key: '5' })
    expect(toDraft(s, NOW, TZ)).toEqual({ ok: false, missing: 'rate' })
  })
})

describe('load (edit an existing transaction)', () => {
  it('restores fields and keeps the original time when the day is unchanged', () => {
    const s = run({
      type: 'load',
      tx: {
        id: 't1',
        type: 'expense',
        amount_minor: 145050,
        account_id: BANK,
        to_account_id: null,
        category_id: FOOD,
        party_id: null,
        occurred_on: '2026-10-06',
        occurred_at: '2026-10-06T03:15:00.000Z',
        note: 'Groceries',
        original_amount_minor: null,
        original_currency: null,
        fx_rate: null,
      },
    })
    expect(s).toMatchObject({ editingId: 't1', keypad: '1450.5', accountId: BANK, categoryId: FOOD, day: '2026-10-06', note: 'Groceries' })
    const r = toDraft(s, NOW, TZ)
    expect(r.ok && r.draft.occurred_at).toBe('2026-10-06T03:15:00.000Z')
  })
})

describe('review fixes', () => {
  it('a comma decimal separator in the fx rate is a decimal point', () => {
    const s = run({ type: 'setType', value: 'income' }, { type: 'toggleFx' }, { type: 'setFxRate', value: '121,40' })
    expect(s.fx?.rate).toBe('121.40')
  })
  it('a second separator is ignored', () => {
    const s = run({ type: 'setType', value: 'income' }, { type: 'toggleFx' }, { type: 'setFxRate', value: '1.2.3' })
    expect(s.fx?.rate).toBe('1.23')
  })
  it('cannot move the day into the future', () => expect(run({ type: 'setDay', day: '2026-10-09' }).day).toBe(TODAY))
  it('refuses to load types the sheet cannot edit (emi/lending)', () =>
    expect(
      run({
        type: 'load',
        tx: { id: 'e', type: 'emi', amount_minor: 1, account_id: CASH, to_account_id: null, category_id: null, party_id: null, occurred_on: TODAY, occurred_at: NOW.toISOString(), note: null, original_amount_minor: null, original_currency: null, fx_rate: null },
      }).editingId,
    ).toBeNull())
})
