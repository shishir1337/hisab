import { column, Schema, Table } from '@powersync/common'

// Local SQLite schema (PowerSync). Mirrors supabase/migrations; `id` is implicit (text).
// SQLite has no bool/date types: booleans are 0/1 integers, dates/timestamps are ISO text.

const timestamps = {
  user_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
}

const profiles = new Table({
  ...timestamps,
  display_name: column.text,
  base_currency: column.text,
  timezone: column.text,
  number_grouping: column.text,
  nudge_enabled: column.integer,
  nudge_time: column.text,
  lending_reminder_interval_days: column.integer,
  theme: column.text,
  app_lock_enabled: column.integer,
  hide_amounts: column.integer,
  onboarded_at: column.text,
})

const accounts = new Table(
  {
    ...timestamps,
    name: column.text,
    type: column.text,
    opening_balance_minor: column.integer,
    opening_date: column.text,
    color: column.text,
    icon: column.text,
    sort_order: column.integer,
    archived_at: column.text,
  },
  { indexes: { sort: ['sort_order'] } },
)

const categories = new Table(
  {
    ...timestamps,
    name: column.text,
    kind: column.text,
    icon: column.text,
    color: column.text,
    sort_order: column.integer,
    archived_at: column.text,
  },
  { indexes: { kind: ['kind', 'sort_order'] } },
)

const parties = new Table({
  ...timestamps,
  name: column.text,
  kind: column.text,
  phone: column.text,
  note: column.text,
  archived_at: column.text,
})

const loans = new Table({
  ...timestamps,
  name: column.text,
  party_id: column.text,
  emi_amount_minor: column.integer,
  total_installments: column.integer,
  first_due_date: column.text,
  installments_paid_before: column.integer,
  default_account_id: column.text,
  note: column.text,
  closed_at: column.text,
})

const lendings = new Table(
  {
    ...timestamps,
    party_id: column.text,
    direction: column.text,
    principal_minor: column.integer,
    started_on: column.text,
    due_on: column.text,
    reminder_interval_days: column.integer,
    note: column.text,
    closed_at: column.text,
  },
  { indexes: { party: ['party_id'] } },
)

const recurring_rules = new Table({
  ...timestamps,
  type: column.text,
  amount_minor: column.integer,
  account_id: column.text,
  to_account_id: column.text,
  category_id: column.text,
  party_id: column.text,
  note: column.text,
  frequency: column.text,
  interval: column.integer,
  anchor_date: column.text,
  end_date: column.text,
  mode: column.text,
  paused_at: column.text,
})

const recurring_skips = new Table(
  { ...timestamps, rule_id: column.text, occurrence_date: column.text },
  { indexes: { rule: ['rule_id'] } },
)

const transactions = new Table(
  {
    ...timestamps,
    type: column.text,
    amount_minor: column.integer,
    account_id: column.text,
    to_account_id: column.text,
    category_id: column.text,
    party_id: column.text,
    occurred_on: column.text,
    occurred_at: column.text,
    note: column.text,
    original_amount_minor: column.integer,
    original_currency: column.text,
    fx_rate: column.text,
    recurring_rule_id: column.text,
    occurrence_date: column.text,
    loan_id: column.text,
    installment_number: column.integer,
    lending_id: column.text,
  },
  {
    indexes: {
      day: ['occurred_on'],
      account: ['account_id'],
      to_account: ['to_account_id'],
      category: ['category_id'],
      party: ['party_id'],
      loan: ['loan_id'],
      lending: ['lending_id'],
      rule: ['recurring_rule_id', 'occurrence_date'],
    },
  },
)

const lending_reminders_sent = new Table(
  { ...timestamps, lending_id: column.text, channel: column.text, sent_at: column.text },
  { indexes: { lending: ['lending_id'] } },
)

const budgets = new Table({ ...timestamps, category_id: column.text, amount_minor: column.integer })

/** Writes the server rejected permanently. Local-only: never uploaded. */
const upload_issues = new Table(
  {
    table_name: column.text,
    row_id: column.text,
    op: column.text,
    code: column.text,
    message: column.text,
    payload: column.text,
    created_at: column.text,
  },
  { localOnly: true },
)

export const AppSchema = new Schema({
  profiles,
  accounts,
  categories,
  parties,
  loans,
  lendings,
  recurring_rules,
  recurring_skips,
  transactions,
  lending_reminders_sent,
  budgets,
  upload_issues,
})

export type Database = (typeof AppSchema)['types']
export type ProfileRow = Database['profiles']
export type AccountRow = Database['accounts']
export type CategoryRow = Database['categories']
export type PartyRow = Database['parties']
export type LoanRow = Database['loans']
export type LendingRow = Database['lendings']
export type RecurringRuleRow = Database['recurring_rules']
export type TransactionRow = Database['transactions']
export type BudgetRow = Database['budgets']

/** Postgres boolean columns that SQLite stores as 0/1 (converted on upload). */
export const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  profiles: ['nudge_enabled', 'app_lock_enabled', 'hide_amounts'],
}
