'use client'

import { addMonths, monthLabel, monthlyReport, monthRange, toCsv, type ReportRow } from '@hisab/core'
import { Q, type TransactionView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { labelFor } from '@/components/dashboard'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

/** Monthly report (spec §7.3): income by source, spending by category, EMIs, lending, net & savings rate. */
export function ReportView() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const [month, setMonth] = useState(() => monthRange(today).start)
  const { start, end } = monthRange(month)
  const prev = monthRange(addMonths(month, -1))
  const { data: rows } = useQuery<ReportRow>(Q.reportRows, [start, end])
  const { data: prevRows } = useQuery<ReportRow>(Q.reportRows, [prev.start, prev.end])
  const { data: txs } = useQuery<TransactionView>(Q.transactionsBetween, [start, end])
  const r = monthlyReport(rows, prevRows)

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Type', 'Description', 'Category', 'Account', 'To account', 'Person / company', `Amount (${currency})`, 'Original amount', 'Original currency', 'Rate'],
      [...txs].reverse().map((t) => [
        t.occurred_on,
        labelFor(t.type),
        t.note,
        t.category_name,
        t.account_name,
        t.to_account_name,
        t.party_name,
        t.amount_minor / 100,
        t.original_amount_minor != null ? t.original_amount_minor / 100 : null,
        t.original_currency,
        t.fx_rate,
      ]),
    )
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `hisab-${month.slice(0, 7)}.csv`)
  }

  return (
    <div className="report flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </Button>
          <span className="w-24 text-center text-[14px] font-semibold">{monthLabel(month)}</span>
          <Button variant="outline" size="icon" aria-label="Next month" disabled={month === monthRange(today).start} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={txs.length === 0}>
            <Download /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> PDF
          </Button>
        </div>
      </div>
      <h2 className="hidden text-[22px] font-bold print:block">Hisab — {monthLabel(month)}</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Income" value={<Money minor={r.income} currency={currency} grouping={grouping} />} change={r.vsLastMonth.income} good="up" tone="positive" />
        <Kpi label="Spending" value={<Money minor={r.spending} currency={currency} grouping={grouping} />} change={r.vsLastMonth.spending} good="down" />
        <Kpi label="EMIs paid" value={<Money minor={r.emi} currency={currency} grouping={grouping} />} />
        <Kpi
          label="Saved"
          value={<Money minor={r.net} currency={currency} grouping={grouping} />}
          sub={r.savingsRate === null ? 'No income this month' : `${Math.round(r.savingsRate * 100)}% of income`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Spending by category">
          {r.byCategory.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-3">
              {r.byCategory.map((c) => (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between text-[13.5px]">
                    <span>{c.name}</span>
                    <span className="text-text-muted">
                      <Money minor={c.amount} currency={currency} grouping={grouping} className="font-semibold text-text" /> · {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="flex flex-col gap-6">
          <Section title="Income by source">
            {r.bySource.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {r.bySource.map((s) => (
                  <li key={s.id} className="flex justify-between py-2 text-[13.5px]">
                    <span>{s.name}</span>
                    <Money minor={s.amount} currency={currency} grouping={grouping} className="font-semibold text-positive" />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Money with people">
            <ul className="divide-y divide-border-subtle text-[13.5px]">
              <li className="flex justify-between py-2">
                <span>Lent / paid back</span>
                <Money minor={r.lentOut} currency={currency} grouping={grouping} className="font-semibold" />
              </li>
              <li className="flex justify-between py-2">
                <span>Received back / borrowed</span>
                <Money minor={r.collectedIn} currency={currency} grouping={grouping} className="font-semibold" />
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, change, good, sub, tone }: { label: string; value: React.ReactNode; change?: number | null; good?: 'up' | 'down'; sub?: string; tone?: 'positive' }) {
  const better = change == null || change === 0 ? null : good === 'up' ? change > 0 : change < 0
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-[12px] text-text-faint">{label}</p>
      <p className={cn('mt-0.5 text-[20px] font-bold', tone === 'positive' && 'text-positive')}>{value}</p>
      {sub ? (
        <p className="text-[12px] text-text-muted">{sub}</p>
      ) : change != null ? (
        <p className={cn('text-[12px]', better ? 'text-positive' : 'text-warning')}>
          {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(Math.round(change * 100))}% vs last month
        </p>
      ) : (
        <p className="text-[12px] text-text-faint">&nbsp;</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 break-inside-avoid">
      <h3 className="mb-3 text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="py-4 text-center text-[13px] text-text-muted">Nothing this month.</p>
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
