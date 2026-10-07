/** Read queries for the Plan tab: recurring rules, loans, budgets (spec §5.2, §6.3–6.6). */

export interface RecurringRuleView {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount_minor: number
  account_id: string
  to_account_id: string | null
  category_id: string | null
  party_id: string | null
  note: string | null
  frequency: 'weekly' | 'monthly' | 'yearly'
  interval: number
  anchor_date: string
  end_date: string | null
  mode: 'confirm' | 'auto'
  paused_at: string | null
  due_from: string | null
  created_at: string
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  account_name: string | null
  to_account_name: string | null
  party_name: string | null
}

export interface LoanWithPayments {
  id: string
  name: string
  party_id: string | null
  party_name: string | null
  emi_amount_minor: number
  total_installments: number
  first_due_date: string
  installments_paid_before: number
  default_account_id: string | null
  default_account_name: string | null
  note: string | null
  closed_at: string | null
  paid_count: number
  paid_amount: number
}

export interface BudgetWithSpent {
  id: string
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  amount_minor: number
  spent: number
}

const LOANS = `
  select l.id, l.name, l.party_id, p.name as party_name, l.emi_amount_minor, l.total_installments, l.first_due_date,
    l.installments_paid_before, l.default_account_id, a.name as default_account_name, l.note, l.closed_at,
    coalesce((select count(*) from transactions t where t.loan_id = l.id and t.type = 'emi' and t.deleted_at is null), 0) as paid_count,
    coalesce((select sum(t.amount_minor) from transactions t where t.loan_id = l.id and t.type = 'emi' and t.deleted_at is null), 0) as paid_amount
  from loans l
    left join parties p on p.id = l.party_id
    left join accounts a on a.id = l.default_account_id
  where l.deleted_at is null`

export const QP = {
  recurringRules: `
    select r.id, r.type, r.amount_minor, r.account_id, r.to_account_id, r.category_id, r.party_id, r.note, r.frequency,
      r.interval, r.anchor_date, r.end_date, r.mode, r.paused_at, r.due_from, r.created_at,
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      a.name as account_name, ta.name as to_account_name, p.name as party_name
    from recurring_rules r
      left join categories c on c.id = r.category_id
      left join accounts a on a.id = r.account_id
      left join accounts ta on ta.id = r.to_account_id
      left join parties p on p.id = r.party_id
    where r.deleted_at is null
    order by r.paused_at is not null, r.created_at`,

  /** → { rule_id, occurrence_date }[] of occurrences already posted. */
  postedOccurrences: `select recurring_rule_id as rule_id, occurrence_date from transactions
    where deleted_at is null and recurring_rule_id is not null order by occurrence_date`,

  skippedOccurrences: `select rule_id, occurrence_date from recurring_skips where deleted_at is null order by occurrence_date`,

  /** Open loans with EMI payment count/sum. */
  loansWithPayments: `${LOANS} and l.closed_at is null order by l.created_at`,

  /** params: [loanId] */
  loanById: `${LOANS} and l.id = ?`,

  /** params: [loanId] → EMI payments, newest first. */
  loanPayments: `select t.id, t.amount_minor, t.installment_number, t.occurred_on, a.name as account_name
    from transactions t left join accounts a on a.id = t.account_id
    where t.loan_id = ? and t.type = 'emi' and t.deleted_at is null
    order by t.installment_number desc`,

  /** params: [startDay, endDay] → overall budget first, then categories. */
  budgetsWithSpent: `
    select b.id, b.category_id, c.name as category_name, c.icon as category_icon, c.color as category_color, b.amount_minor,
      coalesce((select sum(t.amount_minor) from transactions t
        where t.deleted_at is null and t.type = 'expense' and t.occurred_on between ?1 and ?2
          and (b.category_id is null or t.category_id = b.category_id)), 0) as spent
    from budgets b left join categories c on c.id = b.category_id
    where b.deleted_at is null
    order by b.category_id is not null, c.sort_order`,
} as const
