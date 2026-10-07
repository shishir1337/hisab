'use client'

import { budgetProgress, dayLabel, monthLabel, monthlyReport, monthRange, safeToSpendPerDay, type ReportRow } from '@hisab/core'
import { markEmiPaid, postOccurrence, Q, QP, skipOccurrence, softDeleteTransaction, unskipOccurrence, type BudgetWithSpent, type DueItem, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { ArrowLeftRight, Check } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'
import { toast } from 'sonner'
import { BalanceHero } from '@/components/balance-hero'
import { Money } from '@/components/money'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Button } from '@/components/ui/button'
import { useDueItems } from '@/lib/data'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

/** Web Home (spec §7.4): hero + Due soon + Today on the left; month, categories, budgets on the right. */
export function Dashboard() {
  const { timeZone } = useProfile()
  const today = useToday(timeZone)
  const due = useDueItems(today, timeZone)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <BalanceHero />
        {due.length > 0 && <DueList items={due} today={today} />}
        <TodayList today={today} />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <MonthCard today={today} />
        <BudgetsCard today={today} />
      </div>
    </div>
  )
}

function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-border bg-surface p-5', className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function DueList({ items, today }: { items: DueItem[]; today: string }) {
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const busy = useRef(new Set<string>())

  const record = async (item: DueItem) => {
    if (busy.current.has(item.key)) return
    busy.current.add(item.key)
    try {
      if (item.kind === 'recurring') {
        const r = await postOccurrence(db, userId, item.rule, item.date, { occurred_on: item.date > today ? today : item.date })
        if (r.created) toast(`Recorded · ${item.rule.note || item.rule.category_name}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, r.id) } })
        else toast('Already recorded')
      } else {
        const id = await markEmiPaid(db, userId, item.loan.id, { occurred_on: today })
        toast(`EMI paid · ${item.loan.name}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, id) } })
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t record it')
    } finally {
      busy.current.delete(item.key)
    }
  }

  return (
    <Card title="Due soon" action={<Link href="/plan" className="text-[12.5px] text-text-muted hover:text-text">See all</Link>}>
      <ul className="-my-1 divide-y divide-border-subtle">
        {items.map((item) => {
          const title = item.kind === 'emi' ? item.loan.name : item.rule.note || item.rule.category_name || 'Recurring'
          const amount = item.kind === 'emi' ? item.loan.emi_amount_minor : item.rule.amount_minor
          const income = item.kind === 'recurring' && item.rule.type === 'income'
          return (
            <li key={item.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {item.kind === 'emi' ? '🏦' : (item.rule.category_icon ?? '🔁')} {title}
                </p>
                <p className={cn('text-[12px]', item.overdue ? 'font-semibold text-warning' : 'text-text-faint')}>
                  {item.overdue ? '● overdue · ' : ''}
                  {dayLabel(item.date, today)}
                  {item.kind === 'emi' ? ` · EMI ${item.progress.paid + 1} of ${item.loan.total_installments}` : ''}
                </p>
              </div>
              <Money minor={amount} currency={currency} grouping={grouping} className={cn('text-[14px] font-semibold', income && 'text-positive')} />
              {item.kind === 'recurring' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await skipOccurrence(db, userId, item.rule.id, item.date)
                    toast('Skipped', { action: { label: 'Undo', onClick: () => void unskipOccurrence(db, item.rule.id, item.date) } })
                  }}
                >
                  Skip
                </Button>
              )}
              {(item.kind === 'recurring' || item.loan.default_account_id) && (
                <Button size="icon" aria-label={item.kind === 'emi' ? 'Mark EMI paid' : 'Record'} onClick={() => void record(item)} className="size-9 rounded-full">
                  <Check />
                </Button>
              )}
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
  const { data: rows } = useQuery<TransactionView>(Q.transactionsBetween, [today, today])
  const spent = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_minor, 0)
  return (
    <Card title="Today" action={spent > 0 ? <span className="text-[12.5px] text-text-muted"><Money minor={spent} currency={currency} grouping={grouping} /> spent</span> : undefined}>
      {rows.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-[14px] font-semibold">Nothing logged today</p>
          <p className="mt-0.5 text-[13px] text-text-muted">
            Press <kbd className="rounded border border-border px-1.5 text-[11px]">N</kbd> to log your first one.
          </p>
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-border-subtle">
          {rows.map((t) => (
            <li key={t.id}>
              <TxLine tx={t} onClick={['expense', 'income', 'transfer'].includes(t.type) ? () => quickLog.open({ edit: t }) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function TxLine({ tx, onClick, showDate }: { tx: TransactionView; onClick?: () => void; showDate?: string }) {
  const { currency, grouping } = useProfile()
  const transfer = tx.type === 'transfer'
  const positive = tx.type === 'income' || tx.type === 'lending_in'
  const title = transfer ? `${tx.account_name} → ${tx.to_account_name}` : tx.note || tx.category_name || labelFor(tx.type)
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default">
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-muted text-[15px]">
        {transfer ? <ArrowLeftRight className="size-4 text-text-muted" /> : (tx.category_icon ?? '•')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{title}</span>
        <span className="block truncate text-[12px] text-text-faint">
          {[showDate, transfer ? 'Transfer' : tx.note ? tx.category_name : null, tx.party_name, transfer ? null : tx.account_name].filter(Boolean).join(' · ')}
        </span>
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
  const { start, end } = monthRange(today)
  const { data: rows } = useQuery<ReportRow>(Q.reportRows, [start, end])
  const r = monthlyReport(rows, [])
  const top = r.byCategory.slice(0, 6)
  return (
    <Card title={monthLabel(today)} action={<Link href="/reports" className="text-[12.5px] text-text-muted hover:text-text">Full report</Link>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="In" value={<Money minor={r.income} currency={currency} grouping={grouping} className="text-positive" />} />
        <Stat label="Out" value={<Money minor={r.spending + r.emi} currency={currency} grouping={grouping} />} />
        <Stat label="Net" value={<Money minor={r.net} currency={currency} grouping={grouping} />} />
      </div>
      {top.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3">
          {top.map((c) => (
            <li key={c.id}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span>{c.name}</span>
                <Money minor={c.amount} currency={currency} grouping={grouping} hideCode className="font-semibold" />
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, c.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] text-text-faint">{label}</p>
      <p className="text-[16px] font-bold">{value}</p>
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
    <Card title="Budgets" action={<Link href="/plan" className="text-[12.5px] text-text-muted hover:text-text">Manage</Link>}>
      {overall && (
        <p className="mb-3 text-[13px] text-text-muted">
          Safe to spend: <Money minor={safeToSpendPerDay(overall.amount_minor, overall.spent, today)} currency={currency} grouping={grouping} className="font-bold text-text" />
          /day
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {data.map((b) => {
          const { ratio, state } = budgetProgress(b.spent, b.amount_minor)
          return (
            <li key={b.id}>
              <div className="flex items-baseline justify-between text-[13px]">
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
    </Card>
  )
}
