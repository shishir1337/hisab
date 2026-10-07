/**
 * Read queries shared by web and mobile (run on the local SQLite database). Balance math matches
 * `signedEffect` in @hisab/core and spec §5.2. Every query ignores soft-deleted rows.
 */

/** PowerSync legacy timestamps use a space separator; normalize so ordering and parsing are correct. */
const AT = `replace(t.occurred_at, ' ', 'T')`

const ACCOUNTS_WITH_BALANCE = `
  select a.id, a.name, a.type, a.color, a.icon, a.sort_order, a.opening_balance_minor,
    (a.archived_at is not null) as archived,
    a.opening_balance_minor
      + coalesce((select sum(case when t.type in ('income', 'lending_in') then t.amount_minor else -t.amount_minor end)
          from transactions t where t.deleted_at is null and t.account_id = a.id), 0)
      + coalesce((select sum(t.amount_minor)
          from transactions t where t.deleted_at is null and t.type = 'transfer' and t.to_account_id = a.id), 0)
      as balance_minor
  from accounts a
  where a.deleted_at is null`

export interface AccountWithBalance {
  id: string
  name: string
  type: 'cash' | 'bank' | 'mobile_wallet' | 'card' | 'savings'
  color: string | null
  icon: string | null
  sort_order: number
  opening_balance_minor: number
  archived: 0 | 1
  balance_minor: number
}

export interface CategoryOption {
  id: string
  name: string
  kind: 'income' | 'expense'
  icon: string | null
  color: string | null
  sort_order: number
}

export interface TransactionView {
  id: string
  type: 'expense' | 'income' | 'transfer' | 'emi' | 'lending_out' | 'lending_in'
  amount_minor: number
  account_id: string
  to_account_id: string | null
  category_id: string | null
  party_id: string | null
  occurred_on: string
  occurred_at: string
  note: string | null
  original_amount_minor: number | null
  original_currency: string | null
  fx_rate: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  account_name: string | null
  to_account_name: string | null
  party_name: string | null
}

export const Q = {
  /** All accounts (archived last) with live balances. */
  accountsWithBalance: `${ACCOUNTS_WITH_BALANCE} order by archived, a.sort_order, a.created_at`,

  /** Accounts offered in pickers (not archived). */
  activeAccounts: `select a.id, a.name, a.type, a.icon from accounts a
    where a.deleted_at is null and a.archived_at is null order by a.sort_order, a.created_at`,

  /** Total balance across non-archived accounts → { total }. */
  totalBalance: `select coalesce(sum(balance_minor), 0) as total from (${ACCOUNTS_WITH_BALANCE}) where archived = 0`,

  /** params: [kind] */
  categories: `select id, name, kind, icon, color, sort_order from categories
    where deleted_at is null and archived_at is null and kind = ? order by sort_order, name`,

  parties: `select id, name, kind, phone from parties where deleted_at is null and archived_at is null order by name collate nocase`,

  /** params: [startDay, endDay] → TransactionView[], newest first. */
  transactionsBetween: `
    select t.id, t.type, t.amount_minor, t.account_id, t.to_account_id, t.category_id, t.party_id,
      t.occurred_on, ${AT} as occurred_at, t.note, t.original_amount_minor, t.original_currency, t.fx_rate,
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      a.name as account_name, ta.name as to_account_name, p.name as party_name
    from transactions t
      left join categories c on c.id = t.category_id
      left join accounts a on a.id = t.account_id
      left join accounts ta on ta.id = t.to_account_id
      left join parties p on p.id = t.party_id
    where t.deleted_at is null and t.occurred_on between ? and ?
    order by t.occurred_on desc, ${AT} desc`,

  /** params: [startDay, endDay] → { income, expense } (spending excludes transfers, EMIs and lending). */
  monthSummary: `select
      coalesce(sum(case when type = 'income' then amount_minor end), 0) as income,
      coalesce(sum(case when type = 'expense' then amount_minor end), 0) as expense
    from transactions where deleted_at is null and occurred_on between ? and ?`,

  /** params: [sinceDay] → rows for @hisab/core rankSuggestions/rankCategories. */
  suggestionHistory: `select t.category_id, t.amount_minor, t.note, ${AT} as occurred_at from transactions t
    where t.deleted_at is null and t.type = 'expense' and t.category_id is not null and t.occurred_on >= ?`,

  /** params: [categoryId] → { account_id } of the most recent use. */
  lastAccountForCategory: `select t.account_id from transactions t
    where t.deleted_at is null and t.category_id = ? order by ${AT} desc limit 1`,

  /** params: [sinceDay] → { day, net }[] ascending: daily change of the active-accounts total (trend line).
   * Counts each side of a transfer only if that account is active, so moving money out of (or into)
   * an archived account moves the total like it really does. */
  dailyNet: `select day, sum(delta) as net from (
      select t.occurred_on as day,
        case when t.type in ('income', 'lending_in') then t.amount_minor else -t.amount_minor end as delta
      from transactions t join accounts a on a.id = t.account_id
      where t.deleted_at is null and a.deleted_at is null and a.archived_at is null and t.occurred_on >= ?1
      union all
      select t.occurred_on, t.amount_minor
      from transactions t join accounts a on a.id = t.to_account_id
      where t.deleted_at is null and t.type = 'transfer' and a.deleted_at is null and a.archived_at is null and t.occurred_on >= ?1
    ) group by day having sum(delta) <> 0 order by day`,

  /** params: [startDay, endDay] → rows for @hisab/core monthlyReport. */
  reportRows: `select t.type, t.amount_minor, t.category_id, c.name as category_name, t.party_id, p.name as party_name
    from transactions t left join categories c on c.id = t.category_id left join parties p on p.id = t.party_id
    where t.deleted_at is null and t.occurred_on between ? and ?`,

  profile: `select * from profiles limit 1`,
} as const
