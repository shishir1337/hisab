import { describe, expect, it } from 'vitest'
import { monthlyReport, toCsv, type ReportRow } from '../src/report'

const r = (o: Partial<ReportRow>): ReportRow => ({
  type: 'expense',
  amount_minor: 0,
  category_id: null,
  category_name: null,
  party_id: null,
  party_name: null,
  ...o,
})

describe('monthlyReport', () => {
  const rows = [
    r({ type: 'income', amount_minor: 8000000, category_id: 'sal', category_name: 'Salary', party_id: 'a', party_name: 'Company A' }),
    r({ type: 'income', amount_minor: 2500000, category_id: 'sal', category_name: 'Salary', party_id: 'b', party_name: 'Company B' }),
    r({ type: 'income', amount_minor: 1000000, category_id: 'free', category_name: 'Project / Freelance' }),
    r({ type: 'expense', amount_minor: 780000, category_id: 'food', category_name: 'Food' }),
    r({ type: 'expense', amount_minor: 120000, category_id: 'food', category_name: 'Food' }),
    r({ type: 'expense', amount_minor: 2500000, category_id: 'rent', category_name: 'Rent' }),
    r({ type: 'emi', amount_minor: 1500000 }),
    r({ type: 'lending_out', amount_minor: 1000000 }),
    r({ type: 'lending_in', amount_minor: 300000 }),
    r({ type: 'transfer', amount_minor: 999999 }),
  ]

  it('totals exclude transfers; EMI and lending are separate lines', () =>
    expect(monthlyReport(rows, [])).toMatchObject({
      income: 11500000,
      spending: 3400000,
      emi: 1500000,
      lentOut: 1000000,
      collectedIn: 300000,
      net: 11500000 - 3400000 - 1500000,
    }))

  it('savings rate = net / income', () => expect(monthlyReport(rows, []).savingsRate).toBeCloseTo((11500000 - 4900000) / 11500000))

  it('spending by category, largest first, with share', () =>
    expect(monthlyReport(rows, []).byCategory).toEqual([
      { id: 'rent', name: 'Rent', amount: 2500000, share: 2500000 / 3400000 },
      { id: 'food', name: 'Food', amount: 900000, share: 900000 / 3400000 },
    ]))

  it('income by source: party, else category', () =>
    expect(monthlyReport(rows, []).bySource.map((s) => [s.name, s.amount])).toEqual([
      ['Company A', 8000000],
      ['Company B', 2500000],
      ['Project / Freelance', 1000000],
    ]))

  it('no income → savings rate null (never NaN/Infinity)', () =>
    expect(monthlyReport([r({ amount_minor: 100, category_id: 'x', category_name: 'X' })], []).savingsRate).toBeNull())

  it('vs last month: null deltas when last month is empty', () => expect(monthlyReport(rows, []).vsLastMonth).toEqual({ income: null, spending: null }))

  it('vs last month: relative change', () =>
    expect(monthlyReport(rows, [r({ type: 'income', amount_minor: 10000000 }), r({ amount_minor: 4000000, category_id: 'x', category_name: 'X' })]).vsLastMonth).toEqual({
      income: 0.15,
      spending: -0.15,
    }))
})

describe('toCsv', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () =>
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 'plain']])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",plain\r\n'))
  it('guards against spreadsheet formula injection', () => expect(toCsv(['note'], [['=HYPERLINK("x")'], ['+1'], ['-2'], ['@a']])).toBe("note\r\n\"'=HYPERLINK(\"\"x\"\")\"\r\n'+1\r\n'-2\r\n'@a\r\n"))
  it('numbers and nulls', () => expect(toCsv(['n', 'm'], [[1450.5, null]])).toBe('n,m\r\n1450.5,\r\n'))
})
