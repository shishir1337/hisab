/** Monthly report (spec §7.3) and CSV export helpers. */

export interface ReportRow {
  type: 'expense' | 'income' | 'transfer' | 'emi' | 'lending_out' | 'lending_in'
  amount_minor: number
  category_id: string | null
  category_name: string | null
  party_id: string | null
  party_name: string | null
}

export interface MonthlyReport {
  income: number
  spending: number
  emi: number
  lentOut: number
  collectedIn: number
  /** income − spending − EMIs (lending movements and transfers excluded). */
  net: number
  /** net / income, or null when there was no income. */
  savingsRate: number | null
  byCategory: { id: string; name: string; amount: number; share: number }[]
  bySource: { id: string; name: string; amount: number }[]
  /** Relative change vs last month, or null when last month had none. */
  vsLastMonth: { income: number | null; spending: number | null }
}

const sum = (rows: ReportRow[], type: ReportRow['type']) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount_minor, 0)

function groupSum(rows: ReportRow[], key: (r: ReportRow) => [string, string]) {
  const m = new Map<string, { id: string; name: string; amount: number }>()
  for (const r of rows) {
    const [id, name] = key(r)
    const g = m.get(id) ?? { id, name, amount: 0 }
    g.amount += r.amount_minor
    m.set(id, g)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

const change = (now: number, before: number) => (before === 0 ? null : Math.round(((now - before) / before) * 1e4) / 1e4)

export function monthlyReport(rows: ReportRow[], prevRows: ReportRow[]): MonthlyReport {
  const income = sum(rows, 'income')
  const spending = sum(rows, 'expense')
  const emi = sum(rows, 'emi')
  const net = income - spending - emi
  const byCategory = groupSum(
    rows.filter((r) => r.type === 'expense'),
    (r) => [r.category_id ?? 'none', r.category_name ?? 'Uncategorized'],
  ).map((g) => ({ ...g, share: spending > 0 ? g.amount / spending : 0 }))
  const bySource = groupSum(
    rows.filter((r) => r.type === 'income'),
    (r) => (r.party_id ? [`p:${r.party_id}`, r.party_name ?? 'Unknown'] : [`c:${r.category_id ?? 'none'}`, r.category_name ?? 'Other income']),
  ).map((g) => ({ ...g, id: g.id.slice(2) }))

  return {
    income,
    spending,
    emi,
    lentOut: sum(rows, 'lending_out'),
    collectedIn: sum(rows, 'lending_in'),
    net,
    savingsRate: income > 0 ? net / income : null,
    byCategory,
    bySource,
    vsLastMonth: { income: change(income, sum(prevRows, 'income')), spending: change(spending, sum(prevRows, 'expense')) },
  }
}

/** RFC 4180 CSV with CRLF line endings. Cells starting with = + - @ are prefixed with ' (formula injection). */
export function toCsv(columns: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
