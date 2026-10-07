/**
 * Read queries shared by web and mobile (run on the local SQLite database). Balance math matches
 * `signedEffect` in @hisab/core and spec §5.2. Every query ignores soft-deleted rows.
 */

/** Signed effect of transaction `t` on account `a` (SQL twin of core `signedEffect`). */
const EFFECT_ON_ACCOUNT = `case
  when t.type = 'transfer' and t.to_account_id = a.id then t.amount_minor
  when t.type = 'transfer' then -t.amount_minor
  when t.type in ('income', 'lending_in') then t.amount_minor
  else -t.amount_minor end`

/** Signed effect on the total balance (transfers net to zero). */
const EFFECT_ON_TOTAL = `case
  when t.type = 'transfer' then 0
  when t.type in ('income', 'lending_in') then t.amount_minor
  else -t.amount_minor end`

const ACCOUNTS_WITH_BALANCE = `
  select a.id, a.name, a.type, a.color, a.icon, a.sort_order, a.opening_balance_minor,
    (a.archived_at is not null) as archived,
    a.opening_balance_minor + coalesce((
      select sum(${EFFECT_ON_ACCOUNT}) from transactions t
      where t.deleted_at is null and (t.account_id = a.id or t.to_account_id = a.id)
    ), 0) as balance_minor
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
      t.occurred_on, t.occurred_at, t.note, t.original_amount_minor, t.original_currency, t.fx_rate,
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      a.name as account_name, ta.name as to_account_name, p.name as party_name
    from transactions t
      left join categories c on c.id = t.category_id
      left join accounts a on a.id = t.account_id
      left join accounts ta on ta.id = t.to_account_id
      left join parties p on p.id = t.party_id
    where t.deleted_at is null and t.occurred_on between ? and ?
    order by t.occurred_on desc, t.occurred_at desc`,

  /** params: [startDay, endDay] → { income, expense } (spending excludes transfers, EMIs and lending). */
  monthSummary: `select
      coalesce(sum(case when type = 'income' then amount_minor end), 0) as income,
      coalesce(sum(case when type = 'expense' then amount_minor end), 0) as expense
    from transactions where deleted_at is null and occurred_on between ? and ?`,

  /** params: [sinceDay] → rows for @hisab/core rankSuggestions/rankCategories. */
  suggestionHistory: `select category_id, amount_minor, note, occurred_at from transactions
    where deleted_at is null and type = 'expense' and category_id is not null and occurred_on >= ?`,

  /** params: [categoryId] → { account_id } of the most recent use. */
  lastAccountForCategory: `select account_id from transactions
    where deleted_at is null and category_id = ? order by occurred_at desc limit 1`,

  /** params: [sinceDay] → { day, net }[] ascending: daily change of the total (for the trend line). */
  dailyNet: `select t.occurred_on as day, sum(${EFFECT_ON_TOTAL}) as net
    from transactions t join accounts a on a.id = t.account_id
    where t.deleted_at is null and a.archived_at is null and t.occurred_on >= ? and t.type <> 'transfer'
    group by t.occurred_on order by t.occurred_on`,

  profile: `select * from profiles limit 1`,
} as const
