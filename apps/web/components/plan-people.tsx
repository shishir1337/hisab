'use client'

import {
  addDays,
  parseAmount,
  budgetProgress,
  formatMoney,
  lendingStatus,
  loanProgress,
  monthRange,
  occurrences,
  reminderMessage,
  safeToSpendPerDay,
  whatsappUrl,
} from '@hisab/core'
import {
  groupOccurrences,
  logReminderSent,
  markEmiPaid,
  pauseRecurringRule,
  Q,
  QL,
  QP,
  recordPersonRepayment,
  softDeleteTransaction,
  type BudgetWithSpent,
  type LendingView,
  type LoanWithPayments,
  type PersonWithBalance,
  type RecurringRuleView,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Check, MessageCircle, Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/chip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {hint && <span className="text-[12px] text-text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-[13px] text-text-muted">{children}</p>

// ---------------------------------------------------------------- Plan

export function PlanView() {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { start, end } = monthRange(today)
  const { data: budgets } = useQuery<BudgetWithSpent>(QP.budgetsWithSpent, [start, end])
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  const done = groupOccurrences([...posted, ...skipped])
  const paying = useRef(new Set<string>())
  const overall = budgets.find((b) => !b.category_id)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Budgets" hint="Edit on the phone app">
        {budgets.length === 0 ? (
          <Empty>No budgets yet.</Empty>
        ) : (
          <>
            {overall && (
              <p className="mb-3 text-[13px] text-text-muted">
                Safe to spend <Money minor={safeToSpendPerDay(overall.amount_minor, overall.spent, today)} currency={currency} grouping={grouping} className="font-bold text-text" />
                /day
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {budgets.map((b) => {
                const { ratio, state } = budgetProgress(b.spent, b.amount_minor)
                return (
                  <li key={b.id}>
                    <div className="flex justify-between text-[13px]">
                      <span>{b.category_name ?? 'Overall'}</span>
                      <span className={cn('text-text-muted', state === 'over' && 'text-danger')}>
                        <Money minor={b.spent} currency={currency} grouping={grouping} hideCode /> / <Money minor={b.amount_minor} currency={currency} grouping={grouping} hideCode />
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div className={cn('h-full rounded-full', state === 'over' ? 'bg-danger' : state === 'near' ? 'bg-warning' : 'bg-brand')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>

      <Card title="Recurring">
        {rules.length === 0 ? (
          <Empty>No recurring items yet.</Empty>
        ) : (
          <ul className="-my-1 divide-y divide-border-subtle">
            {rules.map((r) => {
              const from = [r.anchor_date, r.due_from ?? ''].reduce((a, b) => (b > a ? b : a))
              const next = r.paused_at ? null : (occurrences(r, from, addDays(today, 800)).find((d) => !done.get(r.id)?.has(d)) ?? null)
              return (
                <li key={r.id} className={cn('flex items-center gap-3 py-2.5', r.paused_at && 'opacity-50')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {r.category_icon ?? '🔁'} {r.note || r.category_name || `${r.account_name} → ${r.to_account_name}`}
                    </span>
                    <span className="block text-[12px] text-text-faint">
                      {r.paused_at ? 'Paused' : next ? `next ${day(next)}` : 'Ended'}
                      {r.mode === 'auto' ? ' · Auto' : ''}
                    </span>
                  </span>
                  <Money minor={r.amount_minor} currency={currency} grouping={grouping} hideCode className={cn('text-[14px] font-semibold', r.type === 'income' && 'text-positive')} />
                  <Button variant="ghost" size="icon" aria-label={r.paused_at ? 'Resume' : 'Pause'} onClick={() => void pauseRecurringRule(db, r.id, !r.paused_at, today)}>
                    {r.paused_at ? <Play /> : <Pause />}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Loans">
        {loans.length === 0 ? (
          <Empty>No loans.</Empty>
        ) : (
          <ul className="flex flex-col gap-4">
            {loans.map((l) => {
              const p = loanProgress(l, l.paid_count, l.paid_amount, today)
              return (
                <li key={l.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14px] font-semibold">🏦 {l.name}</span>
                    <Money minor={p.remainingAmount} currency={currency} grouping={grouping} className="text-[14px] font-bold" />
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(p.paid / l.total_installments) * 100}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px]">
                    <span className={cn(p.isOverdue ? 'font-semibold text-warning' : 'text-text-faint')}>
                      {p.paid} of {l.total_installments} · {p.monthsLeft} left
                      {p.nextDueDate ? ` · ${p.isOverdue ? '● overdue since' : 'next'} ${day(p.nextDueDate)}` : ' · paid off'}
                    </span>
                    {p.nextDueDate && l.default_account_id && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if (paying.current.has(l.id)) return
                          paying.current.add(l.id)
                          try {
                            const id = await markEmiPaid(db, userId, l.id, { occurred_on: today })
                            toast(`EMI paid · ${l.name}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, id) } })
                          } catch (e) {
                            toast(e instanceof Error ? e.message : 'Couldn’t record it')
                          } finally {
                            paying.current.delete(l.id)
                          }
                        }}
                      >
                        <Check /> Mark paid
                      </Button>
                    )}
                  </div>
                  {p.debtFreeBy && <p className="mt-1 text-[12px] text-text-muted">Debt-free by {day(p.debtFreeBy)}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- People

export function PeopleView() {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { data: people } = useQuery<PersonWithBalance>(QL.peopleWithBalances)
  const [repay, setRepay] = useState<{ person: PersonWithBalance; direction: 'lent' | 'borrowed' } | null>(null)
  const money = (m: number) => formatMoney(m, currency, { grouping }).text

  const remind = async (p: PersonWithBalance) => {
    if (!p.phone) return
    const lendings = await db.getAll<LendingView>(QL.lendingsForParty, [p.id])
    const open = lendings.filter((l) => l.direction === 'lent' && lendingStatus(l, l.repaid, today).status !== 'settled').sort((a, b) => (a.started_on < b.started_on ? -1 : 1))
    if (!open[0]) return
    const text = reminderMessage({ name: p.name.split(' ')[0]!, amount: money(p.owed_to_me), startedOn: open[0].started_on, direction: 'lent' })
    window.open(whatsappUrl(p.phone, text), '_blank', 'noopener')
    await logReminderSent(db, userId, open[0].id, 'whatsapp')
  }

  return (
    <>
      {people.length === 0 ? (
        <Card title="People">
          <Empty>No one yet. Add a lending from the phone app (People → +).</Empty>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead className="border-b border-border text-left text-[12px] text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const owes = p.owed_to_me > 0
                const owed = p.i_owe > 0
                const overdue = p.next_due !== null && p.next_due < today
                return (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className={cn('px-4 py-3', overdue ? 'font-semibold text-warning' : 'text-text-muted')}>
                      {owes && owed ? `Owes you · you owe ${money(p.i_owe)}` : owes ? 'Owes you' : owed ? 'You owe' : 'Settled'}
                      {p.next_due ? (overdue ? ` · ● overdue since ${day(p.next_due)}` : ` · due ${day(p.next_due)}`) : ''}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(owes || owed) && <Money minor={owes ? p.owed_to_me : p.i_owe} currency={currency} grouping={grouping} className={cn('font-semibold', owes && 'text-positive')} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {owes && p.phone && (
                          <Button size="sm" className="bg-[#1DA851] text-white" onClick={() => void remind(p)}>
                            <MessageCircle /> WhatsApp
                          </Button>
                        )}
                        {owes && (
                          <Button size="sm" variant="secondary" onClick={() => setRepay({ person: p, direction: 'lent' })}>
                            Got paid
                          </Button>
                        )}
                        {owed && (
                          <Button size="sm" variant="secondary" onClick={() => setRepay({ person: p, direction: 'borrowed' })}>
                            Paid back
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={repay !== null} onOpenChange={(o) => !o && setRepay(null)}>
        {repay && (
          <DialogContent title={repay.direction === 'lent' ? `Got paid by ${repay.person.name}` : `Paid back ${repay.person.name}`}>
            <RepayForm person={repay.person} direction={repay.direction} onDone={() => setRepay(null)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function RepayForm({ person, direction, onDone }: { person: PersonWithBalance; direction: 'lent' | 'borrowed'; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const outstanding = direction === 'lent' ? person.owed_to_me : person.i_owe
  const [amount, setAmount] = useState(String(outstanding / 100))
  const [account, setAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = account || accounts[0]?.id || ''

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        const parsed = parseAmount(amount)
        if (!parsed.ok) return setError('Enter the amount, e.g. 1500 or 1,500.50')
        const minor = parsed.minor
        if (!chosen) return setError('Add an account first (Settings)')
        setBusy(true)
        try {
          const ids = await recordPersonRepayment(db, userId, person.id, direction, { amount_minor: minor, account_id: chosen, occurred_on: today })
          toast('Repayment recorded', { action: { label: 'Undo', onClick: () => void Promise.all(ids.map((id) => softDeleteTransaction(db, id))) } })
          onDone()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Couldn’t save')
          setBusy(false)
        }
      }}
    >
      <label className="text-[12.5px] text-text-muted">
        Amount ({currency})
        <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(null))} className="mt-1" />
      </label>
      <label className="text-[12.5px] text-text-muted">
        {direction === 'lent' ? 'Received in' : 'Paid from'}
        <Select className="mt-1 w-full" value={chosen} onChange={(e) => setAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </label>
      <p role="alert" className="min-h-5 text-[13px] text-danger">
        {error ?? ''}
      </p>
      <Button type="submit" disabled={busy}>
        Save
      </Button>
    </form>
  )
}
