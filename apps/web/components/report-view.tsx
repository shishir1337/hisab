'use client'

import { addMonths, monthLabel, monthlyReport, monthRange, toCsv, type ReportRow } from '@hisab/core'
import { Q, type TransactionView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { Download, Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { labelFor } from '@/components/dashboard'
import { Money } from '@/components/money'
import { MonthStepper } from '@/components/month-stepper'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useCategoryMeta } from '@/lib/data'
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
  const meta = useCategoryMeta()

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
    // BOM so Excel on Windows reads Bangla / UTF-8 text correctly.
    download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `hisab-${month.slice(0, 7)}.csv`)
  }

  return (
    <div className="report flex flex-col gap-5 lg:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <MonthStepper month={month} onChange={setMonth} max={monthRange(today).start} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={txs.length === 0} title="Download this month as a spreadsheet">
            <Download /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} title="Print or save as PDF">
            <Printer /> PDF
          </Button>
        </div>
      </div>
      <h2 className="hidden text-[22px] font-bold print:block">Hisab — {monthLabel(month)}</h2>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Kpi label="Income" value={<Money minor={r.income} currency={currency} grouping={grouping} />} change={r.vsLastMonth.income} good="up" tone={r.income > 0 ? 'positive' : undefined} />
        <Kpi label="Spending" value={<Money minor={r.spending} currency={currency} grouping={grouping} />} change={r.vsLastMonth.spending} good="down" />
        <Kpi label="EMIs paid" value={<Money minor={r.emi} currency={currency} grouping={grouping} />} sub="Loan instalments" />
        <Kpi
          label="Saved"
          value={<Money minor={r.net} currency={currency} grouping={grouping} />}
          sub={r.savingsRate === null ? 'No income this month' : `${Math.round(r.savingsRate * 100)}% of income`}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
        <Card title="Spending by category" description={r.byCategory.length ? `${r.byCategory.length} categories` : undefined} className="break-inside-avoid">
          {r.byCategory.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-4">
              {r.byCategory.map((c) => (
                <li key={c.id}>
                  <div className="flex items-center gap-2 text-[13.5px]">
                    <span aria-hidden className="w-5 text-center text-[14px]">
                      {meta.get(c.id)?.icon ?? '•'}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="num w-10 text-right text-[12px] text-text-faint">{Math.round(c.share * 100)}%</span>
                    <Money minor={c.amount} currency={currency} grouping={grouping} hideCode className="min-w-[72px] text-right font-semibold" />
                  </div>
                  <Progress value={c.share} label={`${c.name} share of spending`} className="mt-1.5 ml-7" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <Card title="Income by source" className="break-inside-avoid">
            {r.bySource.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {r.bySource.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2.5 text-[13.5px] first:pt-0 last:pb-0">
                    <span aria-hidden className="w-5 text-center text-[14px]">
                      {meta.get(s.id)?.icon ?? '•'}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={s.name}>
                      {s.name}
                    </span>
                    <Money minor={s.amount} currency={currency} grouping={grouping} className="font-semibold text-positive" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Money with people" className="break-inside-avoid">
            <ul className="divide-y divide-border-subtle text-[13.5px]">
              <li className="flex justify-between gap-3 py-2.5 first:pt-0">
                <span className="text-text-muted">Lent out / paid back</span>
                <Money minor={r.lentOut} currency={currency} grouping={grouping} className="font-semibold" />
              </li>
              <li className="flex justify-between gap-3 py-2.5 last:pb-0">
                <span className="text-text-muted">Received back / borrowed</span>
                <Money minor={r.collectedIn} currency={currency} grouping={grouping} className="font-semibold" />
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, change, good, sub, tone }: { label: string; value: React.ReactNode; change?: number | null; good?: 'up' | 'down'; sub?: string; tone?: 'positive' }) {
  const better = change == null || change === 0 ? null : good === 'up' ? change > 0 : change < 0
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface px-4 py-3.5 break-inside-avoid md:px-5 md:py-4">
      <p className="text-[12.5px] text-text-faint">{label}</p>
      <p className={cn('mt-0.5 truncate text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]', tone === 'positive' && 'text-positive')}>{value}</p>
      {sub ? (
        <p className="mt-0.5 truncate text-[12.5px] text-text-muted">{sub}</p>
      ) : change != null ? (
        <p className={cn('mt-0.5 inline-flex items-center gap-1 text-[12.5px]', better === null ? 'text-text-muted' : better ? 'text-positive' : 'text-warning')}>
          {change > 0 ? <TrendingUp className="size-3.5" /> : change < 0 ? <TrendingDown className="size-3.5" /> : null}
          <span className="num">{Math.abs(Math.round(change * 100))}%</span>
          <span className="text-text-faint">vs last month</span>
        </p>
      ) : (
        <p className="mt-0.5 text-[12.5px] text-text-faint">No data last month</p>
      )}
    </div>
  )
}

function Empty() {
  return <p className="py-6 text-center text-[13px] text-text-muted">Nothing this month.</p>
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
