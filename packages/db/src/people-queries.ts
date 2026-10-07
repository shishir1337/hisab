/** People & lending queries (spec §5.2 parties/lendings, §6.4). */

/** Σ repayments of lending `l` (lending_in for lent, lending_out for borrowed). The initial movement is excluded. */
const REPAID = `coalesce((select sum(t.amount_minor) from transactions t
  where t.lending_id = l.id and t.deleted_at is null
    and t.type = case l.direction when 'lent' then 'lending_in' else 'lending_out' end), 0)`

const OUTSTANDING = `max(0, l.principal_minor - ${REPAID})`

export interface PersonWithBalance {
  id: string
  name: string
  kind: 'person' | 'company'
  phone: string | null
  owed_to_me: number
  i_owe: number
  /** Earliest due date among lendings that are still outstanding. */
  next_due: string | null
}

export interface LendingView {
  id: string
  party_id: string
  direction: 'lent' | 'borrowed'
  principal_minor: number
  started_on: string
  due_on: string | null
  reminder_interval_days: number | null
  note: string | null
  closed_at: string | null
  repaid: number
}

export interface OpenLending extends LendingView {
  party_name: string
  party_phone: string | null
}

export const QL = {
  peopleWithBalances: `
    select p.id, p.name, p.kind, p.phone,
      coalesce(sum(case when l.direction = 'lent' then ${OUTSTANDING} end), 0) as owed_to_me,
      coalesce(sum(case when l.direction = 'borrowed' then ${OUTSTANDING} end), 0) as i_owe,
      min(case when l.due_on is not null and ${OUTSTANDING} > 0 then l.due_on end) as next_due
    from parties p
      left join lendings l on l.party_id = p.id and l.deleted_at is null and l.closed_at is null
    where p.deleted_at is null and p.archived_at is null
    group by p.id
    order by owed_to_me desc, i_owe desc, p.name collate nocase`,

  /** params: [partyId] → all lendings (incl. closed), newest first. */
  lendingsForParty: `select l.id, l.party_id, l.direction, l.principal_minor, l.started_on, l.due_on,
      l.reminder_interval_days, l.note, l.closed_at, ${REPAID} as repaid
    from lendings l where l.deleted_at is null and l.party_id = ?
    order by l.closed_at is not null, l.started_on desc`,

  /** Not-closed lendings with party info (notifications, Home "Owed to you"). */
  openLendings: `select l.id, l.party_id, l.direction, l.principal_minor, l.started_on, l.due_on,
      l.reminder_interval_days, l.note, l.closed_at, ${REPAID} as repaid, p.name as party_name, p.phone as party_phone
    from lendings l join parties p on p.id = l.party_id
    where l.deleted_at is null and l.closed_at is null and p.deleted_at is null`,

  /** Totals → { owed_to_me, i_owe } */
  lendingTotals: `select
      coalesce(sum(case when l.direction = 'lent' then ${OUTSTANDING} end), 0) as owed_to_me,
      coalesce(sum(case when l.direction = 'borrowed' then ${OUTSTANDING} end), 0) as i_owe
    from lendings l join parties p on p.id = l.party_id
    where l.deleted_at is null and l.closed_at is null and p.deleted_at is null`,

  /** params: [partyId] */
  remindersForParty: `select r.id, r.channel, r.sent_at, r.lending_id from lending_reminders_sent r
    join lendings l on l.id = r.lending_id
    where r.deleted_at is null and l.party_id = ? order by r.sent_at desc`,

  /** params: [partyId] → every transaction with this person (incl. lending movements), newest first. */
  partyHistory: `select t.id, t.type, t.amount_minor, t.occurred_on, t.occurred_at, t.note, t.lending_id,
      c.name as category_name, a.name as account_name
    from transactions t
      left join categories c on c.id = t.category_id
      left join accounts a on a.id = t.account_id
    where t.deleted_at is null
      and (t.party_id = ?1 or t.lending_id in (select id from lendings where party_id = ?1))
    order by t.occurred_on desc, replace(t.occurred_at, ' ', 'T') desc`,

  /** params: [partyId] */
  partyById: `select id, name, kind, phone, note from parties where id = ?`,
} as const
