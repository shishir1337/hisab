import { addDays } from './dates'

export type TxType = 'expense' | 'income' | 'transfer' | 'emi' | 'lending_out' | 'lending_in'

export interface LedgerTx {
  type: TxType
  amount_minor: number
  account_id: string
  to_account_id?: string | null
}

/** How a transaction changes one account's balance (spec §5.2). */
export function signedEffect(tx: LedgerTx, accountId: string): number {
  if (tx.type === 'transfer') {
    if (tx.account_id === accountId) return -tx.amount_minor
    if (tx.to_account_id === accountId) return tx.amount_minor
    return 0
  }
  if (tx.account_id !== accountId) return 0
  return tx.type === 'income' || tx.type === 'lending_in' ? tx.amount_minor : -tx.amount_minor
}

/** Signed effect on total balance (transfers net to zero). */
export function totalEffect(tx: LedgerTx): number {
  if (tx.type === 'transfer') return 0
  return tx.type === 'income' || tx.type === 'lending_in' ? tx.amount_minor : -tx.amount_minor
}

/**
 * End-of-day total balances for the last `days` days (oldest first), derived from the current total
 * and each day's net change. Future-dated entries are already in `total`, so they are backed out first.
 */
export function balanceSeries(
  total: number,
  dailyNet: { day: string; net: number }[],
  today: string,
  days: number,
): { day: string; balance: number }[] {
  const net = new Map(dailyNet.map((d) => [d.day, d.net]))
  let balance = total
  for (const d of dailyNet) if (d.day > today) balance -= d.net
  const out: { day: string; balance: number }[] = []
  let day = today
  for (let i = 0; i < days; i++) {
    out.push({ day, balance })
    balance -= net.get(day) ?? 0
    day = addDays(day, -1)
  }
  return out.reverse()
}
