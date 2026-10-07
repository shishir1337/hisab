'use client'

import { addDays, formatMoney, lendingStatus, loanProgress, monthRange, occurrences, parseAmount, reminderMessage, whatsappUrl } from '@hisab/core'
import {
  groupOccurrences,
  logReminderSent,
  markEmiPaid,
  pauseRecurringRule,
  Q,
  QL,
  QP,
  recordPersonRepayment,
  removeBudget,
  setBudget,
  softDeleteTransaction,
  type BudgetWithSpent,
  type CategoryOption,
  type LendingView,
  type LoanWithPayments,
  type PersonWithBalance,
  type RecurringRuleView,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Check, HandCoins, Landmark, MessageCircle, Pause, Play, Plus, Repeat, Target, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { BudgetList, SafeToSpend } from '@/components/dashboard'
import { Money } from '@/components/money'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'
import { CategoryIcon } from '@/components/ui/category-icon'
import { Select } from '@/components/ui/chip'
import { Dialog, DialogContent, Field } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { MASK, usePrivacy } from '@/lib/privacy'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

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
  const [editing, setEditing] = useState<BudgetWithSpent | 'new' | null>(null)

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
      <Card
        title="Budgets"
        description={budgets.length ? 'This month · select one to change it' : undefined}
        action={
          budgets.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {budgets.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="No budgets yet"
            action={
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus /> Add a budget
              </Button>
            }
          >
            Set a monthly limit overall or for a category, and Hisab shows what’s safe to spend each day.
          </EmptyState>
        ) : (
          <>
            {overall && <SafeToSpend overall={overall} today={today} />}
            <BudgetList budgets={budgets} currency={currency} grouping={grouping} onEdit={(b) => setEditing(b)} />
          </>
        )}
      </Card>

      <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
        <Card title="Recurring" description={rules.length ? `${rules.filter((r) => !r.paused_at).length} active` : undefined}>
          {rules.length === 0 ? (
            <EmptyState icon={<Repeat />} title="Nothing recurring yet">
              Add rent, salary or subscriptions from the phone app and they’ll show up here.
            </EmptyState>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {rules.map((r) => {
                const from = [r.anchor_date, r.due_from ?? ''].reduce((a, b) => (b > a ? b : a))
                const next = r.paused_at ? null : (occurrences(r, from, addDays(today, 800)).find((d) => !done.get(r.id)?.has(d)) ?? null)
                const title = r.note || r.category_name || `${r.account_name} → ${r.to_account_name}`
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-[12px] px-2 py-2.5">
                    <CategoryIcon icon={r.category_icon ?? '🔁'} color={r.category_color} transfer={r.type === 'transfer'} className={cn(r.paused_at && 'opacity-50 grayscale')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[14px] font-medium', r.paused_at && 'text-text-muted')} title={title}>
                        {title}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-[12.5px] text-text-faint">
                        {r.paused_at ? 'Paused' : next ? `Next ${day(next)}` : 'Ended'}
                        {r.mode === 'auto' && (
                          <span title="Recorded automatically on the day" className="rounded-[5px] border border-border px-1 text-[10.5px] leading-4 font-medium tracking-wide text-text-muted uppercase">
                            Auto
                          </span>
                        )}
                      </span>
                    </span>
                    <Money minor={r.amount_minor} currency={currency} grouping={grouping} hideCode className={cn('text-[14px] font-semibold', r.type === 'income' && 'text-positive', r.paused_at && 'opacity-50')} />
                    <div className="flex shrink-0 justify-end sm:w-[92px]">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${r.paused_at ? 'Resume' : 'Pause'} ${title}`}
                        title={r.paused_at ? 'Resume — nothing missed while paused is back-filled' : 'Pause — stops reminders until you resume'}
                        onClick={() => void pauseRecurringRule(db, r.id, !r.paused_at, today)}
                        className="w-8 px-0 sm:w-[84px] sm:px-2"
                      >
                        {r.paused_at ? <Play /> : <Pause />}
                        <span className="max-sm:hidden">{r.paused_at ? 'Resume' : 'Pause'}</span>
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Loans" description={loans.length ? `${loans.length} open` : undefined}>
          {loans.length === 0 ? (
            <EmptyState icon={<Landmark />} title="No loans">
              Track a bank or bike loan’s EMIs from the phone app.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {loans.map((l) => {
                const p = loanProgress(l, l.paid_count, l.paid_amount, today)
                return (
                  <li key={l.id} className="py-3 first:pt-1 last:pb-0">
                    <div className="flex items-center gap-3">
                      <CategoryIcon icon="🏦" color="slate" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium" title={l.name}>
                          {l.name}
                        </p>
                        <p className="truncate text-[12.5px] text-text-faint">
                          {p.paid} of {l.total_installments} paid · {p.monthsLeft} left
                        </p>
                      </div>
                      <div className="text-right">
                        <Money minor={p.remainingAmount} currency={currency} grouping={grouping} className="text-[14px] font-semibold" />
                        <p className="text-[12px] text-text-faint">remaining</p>
                      </div>
                    </div>
                    <Progress value={p.paid / l.total_installments} label={`${l.name} paid off`} className="mt-3" />
                    <div className="mt-2.5 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12.5px]">
                      <span className={cn('min-w-0', p.isOverdue ? 'font-semibold text-danger' : 'text-text-muted')}>
                        {p.nextDueDate ? `${p.isOverdue ? 'Overdue since' : 'Next EMI'} ${day(p.nextDueDate)}` : 'Paid off'}
                        {p.debtFreeBy && <span className="font-normal text-text-faint"> · debt-free by {day(p.debtFreeBy)}</span>}
                      </span>
                      {p.nextDueDate && l.default_account_id && (
                        <Button
                          variant="outline"
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
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent
            title={editing === 'new' ? 'New budget' : `${editing.category_name ?? 'Overall'} budget`}
            description={editing === 'new' ? 'A monthly limit, overall or for one category.' : 'Change the monthly limit, or remove it.'}
          >
            <BudgetForm budget={editing === 'new' ? null : editing} existing={budgets} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

/** Web budget editor (setBudget / removeBudget from @hisab/db — the same calls the phone app makes). */
function BudgetForm({ budget, existing, onDone }: { budget: BudgetWithSpent | null; existing: BudgetWithSpent[]; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const { hidden } = usePrivacy()
  const { data: categories } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const taken = new Set(existing.map((b) => b.category_id ?? ''))
  const free = [...(taken.has('') ? [] : [{ id: '', label: '◎ Overall (all spending)' }]), ...categories.filter((c) => !taken.has(c.id)).map((c) => ({ id: c.id, label: `${c.icon ?? '•'} ${c.name}` }))]
  const [category, setCategory] = useState<string | null>(budget ? (budget.category_id ?? '') : null)
  const chosen = category ?? free[0]?.id ?? ''
  const [amount, setAmount] = useState(budget ? String(budget.amount_minor / 100) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const label = (minor: number) => (hidden ? `${currency} ${MASK}` : formatMoney(minor, currency, { grouping }).text)

  const save = async () => {
    if (busy) return
    const p = parseAmount(amount)
    if (!p.ok || p.minor <= 0) return setError('Enter a monthly limit, e.g. 12000')
    if (!budget && free.length === 0) return setError('Every category already has a budget')
    setBusy(true)
    try {
      const categoryId = budget ? budget.category_id : chosen || null
      await setBudget(db, userId, categoryId, p.minor)
      if (budget) toast(`Budget updated · ${label(p.minor)}`, { action: { label: 'Undo', onClick: () => void setBudget(db, userId, categoryId, budget.amount_minor) } })
      else toast(`Budget added · ${label(p.minor)}`, { action: { label: 'Undo', onClick: () => void removeBudget(db, categoryId) } })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save')
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {!budget && (
        <Field label="For">
          <Select aria-label="Category" wrapperClassName="w-full" value={chosen} onChange={(e) => setCategory(e.target.value)} disabled={free.length === 0}>
            {free.map((c) => (
              <option key={c.id || 'overall'} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={`Monthly limit (${currency})`} hint={budget ? <>Spent so far: {label(budget.spent)}</> : undefined}>
        <Input autoFocus inputMode="decimal" placeholder="0" value={amount} onChange={(e) => (setAmount(e.target.value), setError(null))} className="num text-[16px] font-semibold" />
      </Field>
      <p role="alert" className={cn('-my-1 min-h-5 text-[13px] text-danger', !error && 'invisible')}>
        {error ?? ' '}
      </p>
      <div className="flex gap-2">
        {budget && (
          <Button
            variant="danger"
            size="lg"
            onClick={async () => {
              await removeBudget(db, budget.category_id)
              toast('Budget removed', { action: { label: 'Undo', onClick: () => void setBudget(db, userId, budget.category_id, budget.amount_minor) } })
              onDone()
            }}
          >
            Remove
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          {budget ? 'Save changes' : 'Add budget'}
        </Button>
      </div>
    </form>
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
  const { hidden } = usePrivacy()

  const remind = async (p: PersonWithBalance) => {
    if (!p.phone) return
    const lendings = await db.getAll<LendingView>(QL.lendingsForParty, [p.id])
    const open = lendings.filter((l) => l.direction === 'lent' && lendingStatus(l, l.repaid, today).status !== 'settled').sort((a, b) => (a.started_on < b.started_on ? -1 : 1))
    if (!open[0]) return
    const text = reminderMessage({ name: p.name.split(' ')[0]!, amount: money(p.owed_to_me), startedOn: open[0].started_on, direction: 'lent' })
    window.open(whatsappUrl(p.phone, text), '_blank', 'noopener')
    await logReminderSent(db, userId, open[0].id, 'whatsapp')
  }

  const owedToMe = people.reduce((s, p) => s + p.owed_to_me, 0)
  const iOwe = people.reduce((s, p) => s + p.i_owe, 0)
  const owers = people.filter((p) => p.owed_to_me > 0).length
  const lenders = people.filter((p) => p.i_owe > 0).length
  const overdue = people.filter((p) => p.next_due !== null && p.next_due < today).length

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      {people.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <Summary label="Owed to you" sub={`${owers} ${owers === 1 ? 'person' : 'people'}${overdue ? ` · ${overdue} overdue` : ''}`} subTone={overdue ? 'danger' : undefined}>
            <Money minor={owedToMe} currency={currency} grouping={grouping} className={cn(owedToMe > 0 && 'text-positive')} />
          </Summary>
          <Summary label="You owe" sub={`${lenders} ${lenders === 1 ? 'person' : 'people'}`}>
            <Money minor={iOwe} currency={currency} grouping={grouping} />
          </Summary>
        </div>
      )}

      {people.length === 0 ? (
        <Card>
          <EmptyState icon={<Users />} title="No one here yet" className="py-12">
            When you lend money to someone or borrow from them, add it in the phone app (People → +). Balances and reminders show up here.
          </EmptyState>
        </Card>
      ) : (
        <Card title="Everyone" description={`${people.length} ${people.length === 1 ? 'person' : 'people'}`} bodyClassName="px-2 pb-2">
          <ul className="flex flex-col">
            {people.map((p) => {
              const owes = p.owed_to_me > 0
              const owed = p.i_owe > 0
              const late = p.next_due !== null && p.next_due < today
              const status = owes && owed ? `Owes you · you owe ${hidden ? `${currency} ${MASK}` : money(p.i_owe)}` : owes ? 'Owes you' : owed ? 'You owe' : 'Settled'
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] px-3 py-3 transition-colors duration-150 hover:bg-surface-muted/60 md:flex-nowrap">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium" title={p.name}>
                      {p.name}
                    </p>
                    <p className="line-clamp-2 text-[12.5px] text-text-faint md:truncate">
                      {status}
                      {p.next_due && (late ? <span className="font-semibold text-danger"> · Overdue since {day(p.next_due)}</span> : ` · due ${day(p.next_due)}`)}
                    </p>
                  </div>
                  <div className="text-right md:w-36">
                    {owes || owed ? (
                      <Money minor={owes ? p.owed_to_me : p.i_owe} currency={currency} grouping={grouping} className={cn('text-[14px] font-semibold', owes && 'text-positive')} />
                    ) : (
                      <span className="text-[13px] text-text-faint">—</span>
                    )}
                  </div>
                  <div className="flex w-full justify-end gap-2 pl-12 md:w-[248px] md:pl-0">
                    {owes && p.phone && (
                      <Button size="sm" variant="outline" onClick={() => void remind(p)} title={`Send ${p.name.split(' ')[0]} a friendly WhatsApp reminder`}>
                        <MessageCircle className="text-[#1DA851]" /> Remind
                      </Button>
                    )}
                    {owes && (
                      <Button size="sm" variant="outline" onClick={() => setRepay({ person: p, direction: 'lent' })}>
                        <HandCoins /> Got paid
                      </Button>
                    )}
                    {owed && (
                      <Button size="sm" variant="outline" onClick={() => setRepay({ person: p, direction: 'borrowed' })}>
                        <HandCoins /> Paid back
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <Dialog open={repay !== null} onOpenChange={(o) => !o && setRepay(null)}>
        {repay && (
          <DialogContent title={repay.direction === 'lent' ? `Got paid by ${repay.person.name}` : `Paid back ${repay.person.name}`} description="Record a full or partial repayment.">
            <RepayForm person={repay.person} direction={repay.direction} onDone={() => setRepay(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function Summary({ label, sub, subTone, children }: { label: string; sub: string; subTone?: 'danger'; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface px-4 py-3.5 md:px-5 md:py-4">
      <p className="text-[12.5px] text-text-faint">{label}</p>
      <p className="mt-0.5 truncate text-[20px] font-semibold tracking-[-0.02em] md:text-[24px]">{children}</p>
      <p className={cn('mt-0.5 truncate text-[12.5px]', subTone === 'danger' ? 'font-medium text-danger' : 'text-text-muted')}>{sub}</p>
    </div>
  )
}

function RepayForm({ person, direction, onDone }: { person: PersonWithBalance; direction: 'lent' | 'borrowed'; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
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
      <Field
        label={`Amount (${currency})`}
        hint={
          <>
            Outstanding: <Money minor={outstanding} currency={currency} grouping={grouping} />
          </>
        }
      >
        <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(null))} className="num text-[16px] font-semibold" />
      </Field>
      <Field label={direction === 'lent' ? 'Received in' : 'Paid from'}>
        <Select wrapperClassName="w-full" value={chosen} onChange={(e) => setAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <p role="alert" className={cn('-my-1 min-h-5 text-[13px] text-danger', !error && 'invisible')}>
        {error ?? ' '}
      </p>
      <Button type="submit" size="lg" disabled={busy}>
        Save
      </Button>
    </form>
  )
}
