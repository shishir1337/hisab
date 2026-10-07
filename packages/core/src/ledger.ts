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
