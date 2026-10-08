'use client'

import { budgetProgress, dayLabel, localHour, monthLabel, monthlyReport, monthRange, safeToSpendPerDay, type Grouping, type ReportRow } from '@hisab/core'
import { markEmiPaid, postOccurrence, Q, QP, skipOccurrence, softDeleteTransaction, unskipOccurrence, type BudgetWithSpent, type DueItem, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Check, Plus, SkipForward, Sparkles, Target } from 'lucide-react'
import { useRef } from 'react'
import { toast } from '@/components/ui/toaster'
import { BalanceHero } from '@/components/balance-hero'
import { Money } from '@/components/money'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Button, Kbd } from '@/components/ui/button'
import { Card, CardLink, EmptyState } from '@/components/ui/card'
import { CategoryIcon } from '@/components/ui/category-icon'
import { TxSkeleton } from '@/components/ui/skeleton'
import { budgetTone, Progress } from '@/components/ui/progress'
import { useCategoryMeta, useDueItems, useIsTouch } from '@/lib/data'
import { useListMotion } from '@/lib/motion'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

/** "Good evening, Shishir" + today's date, in the profile time zone. */
export function HomeHeader() {
  const { displayName, timeZone } = useProfile()
  const today = useToday(timeZone)
  const hour = localHour(new Date(), timeZone)
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = displayName?.trim().split(/\s+/)[0]
  const at = new Date(`${today}T00:00:00Z`)
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(at)
  const date = `${part({ weekday: 'long' })}, ${part({ day: 'numeric', month: 'long' })}`
  return (
    <div className="mb-6 md:mb-8">
      <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] md:text-[28px]">
        {greeting}
        {first ? `, ${first}` : ''}
      </h1>
      <p className="mt-1 text-[14px] text-text-muted">{date}</p>
    </div>
  )
}

/** Web Home (spec §7.4): hero + Due soon + Today on the left; month, budgets on the right. */
export function Dashboard() {
  const { timeZone } = useProfile()
  const today = useToday(timeZone)
  const due = useDueItems(today, timeZone)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-6">
      <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
        <BalanceHero />
        {due.length > 0 && <DueList items={due} today={today} />}
        <TodayList today={today} />
      </div>
      <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
        <MonthCard today={today} />
        <BudgetsCard today={today} />
      </div>
    </div>
  )
}

function DueList({ items, today }: { items: DueItem[]; today: string }) {
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const busy = useRef(new Set<string>())
  const list = useListMotion<HTMLUListElement>()

  const record = async (item: DueItem) => {
    if (busy.current.has(item.key)) return
    busy.current.add(item.key)
    try {
      if (item.kind === 'recurring') {
        const r = await postOccurrence(db, userId, item.rule, item.date, { occurred_on: item.date > today ? today : item.date })
        if (r.created) toast(`Recorded · ${item.rule.note || item.rule.category_name}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, r.id) } })
        else toast.info('Already recorded')
      } else {
        const id = await markEmiPaid(db, userId, item.loan.id, { occurred_on: today })
        toast(`EMI paid · ${item.loan.name}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, id) } })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t record it')
    } finally {
      busy.current.delete(item.key)
    }
  }

  return (
    <Card title="Due soon" action={<CardLink href="/plan">See all</CardLink>}>
      <ul ref={list} className="-mx-2 flex flex-col">
        {items.map((item) => {
          const title = item.kind === 'emi' ? item.loan.name : item.rule.note || item.rule.category_name || 'Recurring'
          const amount = item.kind === 'emi' ? item.loan.emi_amount_minor : item.rule.amount_minor
          const income = item.kind === 'recurring' && item.rule.type === 'income'
          const canRecord = item.kind === 'recurring' || Boolean(item.loan.default_account_id)
          return (
            <li key={item.key} data-flip-key={item.key} className="flex items-center gap-3 rounded-[12px] px-2 py-2.5">
              {item.kind === 'emi' ? <CategoryIcon icon="🏦" color="slate" /> : <CategoryIcon icon={item.rule.category_icon ?? '🔁'} color={item.rule.category_color} transfer={item.rule.type === 'transfer'} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium" title={title}>
                  {title}
                </p>
                <p className="truncate text-[12.5px] text-text-faint">
                  {item.overdue && <span className="mr-1 font-semibold text-danger">Overdue ·</span>}
                  {dayLabel(item.date, today)}
                  {item.kind === 'emi' ? ` · EMI ${item.progress.paid + 1}/${item.loan.total_installments}` : ''}
                </p>
              </div>
              <Money minor={amount} currency={currency} grouping={grouping} className={cn('text-[14px] font-semibold', income && 'text-positive')} />
              {/* Fixed-width action column so amounts line up whether or not a row can be skipped. */}
              <div className="flex w-[76px] shrink-0 items-center justify-end gap-1 sm:w-[92px]">
                {item.kind === 'recurring' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-9 px-0 sm:w-auto sm:px-2.5"
                    aria-label={`Skip ${title}`}
                    title="Skip this one — it won’t be recorded"
                    onClick={async () => {
                      await skipOccurrence(db, userId, item.rule.id, item.date)
                      toast('Skipped', { action: { label: 'Undo', onClick: () => void unskipOccurrence(db, item.rule.id, item.date) } })
                    }}
                  >
                    <SkipForward className="sm:hidden" />
                    <span className="max-sm:hidden">Skip</span>
                  </Button>
                )}
                {canRecord && (
                  <button
                    type="button"
                    aria-label={item.kind === 'emi' ? `Mark ${title} EMI paid` : `Record ${title}`}
                    title={item.kind === 'emi' ? 'Mark paid' : 'Record it now'}
                    onClick={() => void record(item)}
                    className="grid size-9 place-items-center rounded-full border border-border bg-surface text-text transition-[background-color,border-color,color,transform] duration-150 hover:border-brand hover:bg-brand hover:text-brand-fg active:scale-95"
                  >
                    <Check className="size-4" strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function TodayList({ today }: { today: string }) {
  const { currency, grouping } = useProfile()
  const quickLog = useQuickLog()
  const touch = useIsTouch()
  const { data: rows, isLoading } = useQuery<TransactionView>(Q.transactionsBetween, [today, today])
  const list = useListMotion<HTMLDivElement>(today)
  const spent = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_minor, 0)
  return (
    <Card
      title="Today"
      action={
        spent > 0 ? (
          <span className="text-[13px] text-text-muted">
            <Money minor={spent} currency={currency} grouping={grouping} className="font-medium text-text" /> spent
          </span>
        ) : undefined
      }
    >
      <div ref={list}>
        {isLoading && rows.length === 0 ? (
          <TxSkeleton count={2} className="-mx-2" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="Nothing logged today"
            className="py-6"
            action={
              touch ? undefined : (
                <Button variant="outline" size="sm" onClick={() => quickLog.open()}>
                  <Plus /> Log money <Kbd className="ml-1">N</Kbd>
                </Button>
              )
            }
          >
            {touch ? (
              <>
                Tap <span className="font-semibold text-text">+</span> to log your first one.
              </>
            ) : (
              'Log what you spend as it happens — it takes a few seconds.'
            )}
          </EmptyState>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {rows.map((t) => (
              <li key={t.id} data-flip-key={t.id} className="rounded-[12px]">
                <TxLine tx={t} onClick={['expense', 'income', 'transfer'].includes(t.type) ? () => quickLog.open({ edit: t }) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

export function txTitle(tx: TransactionView): string {
  return tx.type === 'transfer' ? `${tx.account_name} → ${tx.to_account_name}` : tx.note || tx.party_name || tx.category_name || labelFor(tx.type)
}

/** One transaction row: tinted category tile, title + "category · account", signed amount. */
export function TxLine({ tx, onClick, showDate }: { tx: TransactionView; onClick?: () => void; showDate?: string }) {
  const { currency, grouping } = useProfile()
  const transfer = tx.type === 'transfer'
  const positive = tx.type === 'income' || tx.type === 'lending_in'
  const title = transfer ? `${tx.account_name} → ${tx.to_account_name}` : tx.note || tx.category_name || labelFor(tx.type)
  const meta = [showDate, transfer ? 'Transfer' : tx.note ? (tx.category_name ?? labelFor(tx.type)) : null, tx.party_name, transfer ? null : tx.account_name].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2.5 text-left transition-[background-color,transform] duration-150 enabled:hover:bg-surface-muted enabled:active:scale-[0.99] enabled:active:bg-surface-muted disabled:cursor-default"
    >
      <CategoryIcon icon={tx.category_icon ?? (tx.type === 'emi' ? '🏦' : null)} color={tx.category_color} transfer={transfer} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium" title={title}>
          {title}
        </span>
        <span className="block truncate text-[12.5px] text-text-faint">{meta}</span>
      </span>
      <Money
        minor={positive || transfer ? tx.amount_minor : -tx.amount_minor}
        currency={currency}
        grouping={grouping}
        sign={transfer ? 'never' : 'always'}
        hideCode
        className={cn('text-[14px] font-semibold', transfer ? 'text-text-faint' : positive ? 'text-positive' : '')}
      />
    </button>
  )
}

export function labelFor(type: TransactionView['type']): string {
  return { expense: 'Expense', income: 'Income', transfer: 'Transfer', emi: 'EMI', lending_out: 'Money given', lending_in: 'Money received' }[type]
}

function MonthCard({ today }: { today: string }) {
  const { currency, grouping } = useProfile()
  const meta = useCategoryMeta()
  const { start, end } = monthRange(today)
  const { data: rows } = useQuery<ReportRow>(Q.reportRows, [start, end])
  const r = monthlyReport(rows, [])
  const top = r.byCategory.slice(0, 6)
  return (
    <Card title={monthLabel(today)} action={<CardLink href="/reports">Full report</CardLink>}>
      <div className="grid divide-y divide-border-subtle rounded-[14px] border border-border-subtle bg-surface-muted/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:py-3">
        <Stat label="In" value={<Money minor={r.income} currency={currency} grouping={grouping} animate className={cn(r.income > 0 && 'text-positive')} />} />
        <Stat label="Out" value={<Money minor={r.spending + r.emi} currency={currency} grouping={grouping} animate />} />
        <Stat label="Net" value={<Money minor={r.net} currency={currency} grouping={grouping} animate />} />
      </div>
      {top.length > 0 ? (
        <>
          <p className="mt-5 mb-3 text-[12.5px] font-medium text-text-faint">Top spending</p>
          <ul className="flex flex-col gap-3.5">
            {top.map((c) => (
              <li key={c.id}>
                <div className="flex items-center gap-2 text-[13.5px]">
                  <span aria-hidden className="w-5 text-center text-[14px]">
                    {meta.get(c.id)?.icon ?? '•'}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={c.name}>
                    {c.name}
                  </span>
                  <span className="num w-9 text-right text-[12px] text-text-faint">{Math.round(c.share * 100)}%</span>
                  <Money minor={c.amount} currency={currency} grouping={grouping} hideCode className="min-w-[64px] text-right font-semibold" />
                </div>
                <Progress value={c.share} label={`${c.name} share of spending`} className="mt-1.5 ml-7" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-[13px] text-text-muted">No spending yet this month.</p>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between px-4 py-2.5 sm:block sm:py-0">
      <p className="text-[12.5px] text-text-faint sm:text-[12px]">{label}</p>
      <p className="truncate text-[15px] font-semibold tracking-[-0.01em] sm:mt-0.5 sm:text-[17px]">{value}</p>
    </div>
  )
}

function BudgetsCard({ today }: { today: string }) {
  const { currency, grouping } = useProfile()
  const { start, end } = monthRange(today)
  const { data } = useQuery<BudgetWithSpent>(QP.budgetsWithSpent, [start, end])
  if (data.length === 0) return null
  const overall = data.find((b) => !b.category_id)
  return (
    <Card title="Budgets" action={<CardLink href="/plan">Manage</CardLink>}>
      {overall && <SafeToSpend overall={overall} today={today} />}
      <BudgetList budgets={data} currency={currency} grouping={grouping} />
    </Card>
  )
}

/** Safe-to-spend callout: whole units per day (decimals here are noise). */
export function SafeToSpend({ overall, today }: { overall: BudgetWithSpent; today: string }) {
  const { currency, grouping } = useProfile()
  const daysLeft = Number(monthRange(today).end.slice(8)) - Number(today.slice(8)) + 1
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-surface-muted/50 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">Safe to spend</span>
        <span className="block text-[12px] text-text-faint">
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left this month
        </span>
      </span>
      <span className="shrink-0 text-[13px] text-text-muted">
        <Money minor={safeToSpendPerDay(overall.amount_minor, overall.spent, today)} currency={currency} grouping={grouping} showDecimals="never" className="text-[18px] font-semibold text-text" />
        <span>/day</span>
      </span>
    </div>
  )
}

export function BudgetList({ budgets, currency, grouping, onEdit }: { budgets: BudgetWithSpent[]; currency: string; grouping: Grouping; onEdit?: (b: BudgetWithSpent) => void }) {
  const list = useListMotion<HTMLUListElement>()
  return (
    <ul ref={list} className={cn('flex flex-col', onEdit ? '-mx-2 gap-0.5' : 'gap-4')}>
      {budgets.map((b) => {
        const { ratio, state } = budgetProgress(b.spent, b.amount_minor)
        const name = b.category_name ?? 'Overall'
        const body = (
          <>
            <div className="flex items-center gap-2 text-[13.5px]">
              <span aria-hidden className="w-5 text-center text-[14px]">
                {b.category_id ? (b.category_icon ?? '•') : <Target className="mx-auto size-3.5 text-text-muted" />}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium" title={name}>
                {name}
              </span>
              <span className={cn('num text-[12px] font-medium', state === 'over' ? 'text-danger' : state === 'near' ? 'text-warning' : 'text-text-faint')}>
                {state === 'over' ? 'Over · ' : ''}
                {Math.round(ratio * 100)}%
              </span>
            </div>
            <Progress value={ratio} tone={budgetTone(state)} label={`${name} budget used`} className="mt-2 ml-7" />
            <p className="mt-1.5 ml-7 text-[12px] text-text-faint">
              <Money minor={b.spent} currency={currency} grouping={grouping} hideCode className={cn('font-medium', state === 'over' ? 'text-danger' : 'text-text-muted')} /> of{' '}
              <Money minor={b.amount_minor} currency={currency} grouping={grouping} hideCode />
            </p>
          </>
        )
        return (
          <li key={b.id} data-flip-key={b.id} className="rounded-[12px]">
            {onEdit ? (
              <button type="button" onClick={() => onEdit(b)} aria-label={`Edit ${name} budget`} className="w-full rounded-[12px] px-2 py-2.5 text-left transition-[background-color,transform] duration-150 hover:bg-surface-muted active:scale-[0.99]">
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ul>
  )
}
