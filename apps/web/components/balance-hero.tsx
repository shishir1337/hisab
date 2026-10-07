'use client'

import { addDays, balanceSeries, loanProgress } from '@hisab/core'
import { Q, QL, QP, type LoanWithPayments } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useMemo } from 'react'
import { Money } from '@/components/money'
import { usePrivacy } from '@/lib/privacy'
import { useProfile, useToday } from '@/lib/profile'

const TREND_DAYS = 30

/** Ink hero card (spec §7.3): live total, 30-day trend, Owed-to-you / Loans-left. Click to hide amounts. */
export function BalanceHero() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { hidden, toggle } = usePrivacy()
  const { data: totalRows } = useQuery<{ total: number }>(Q.totalBalance)
  const { data: net } = useQuery<{ day: string; net: number }>(Q.dailyNet, [addDays(today, -TREND_DAYS)])
  const { data: lending } = useQuery<{ owed_to_me: number }>(QL.lendingTotals)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  const total = totalRows[0]?.total ?? 0
  const series = useMemo(() => balanceSeries(total, net, today, TREND_DAYS).map((p) => p.balance), [total, net, today])
  const loansLeft = loans.reduce((s, l) => s + loanProgress(l, l.paid_count, l.paid_amount, today).remainingAmount, 0)
  const owed = lending[0]?.owed_to_me ?? 0

  return (
    <section
      aria-label="Balance"
      role="button"
      tabIndex={0}
      aria-pressed={hidden}
      onClick={toggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      className="hero-card relative cursor-pointer overflow-hidden rounded-hero p-5 select-none md:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full bg-[radial-gradient(rgba(255,255,255,0.10),transparent_70%)]" />
      <p className="text-[12px] text-white/60">Total balance</p>
      <Money minor={total} currency={currency} grouping={grouping} showDecimals="always" className="mt-0.5 block text-[32px] leading-tight font-semibold" />
      {!hidden && <Sparkline values={series} />}
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <Tile label="Owed to you">
          <Money minor={owed} currency={currency} grouping={grouping} className={owed > 0 ? 'font-semibold text-[#4ADE80]' : 'font-semibold'} />
        </Tile>
        <Tile label="Loans left">
          <Money minor={loansLeft} currency={currency} grouping={grouping} className="font-semibold" />
        </Tile>
      </div>
    </section>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.07] px-3 py-2">
      <p className="text-white/55">{label}</p>
      {children}
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 300
  const h = 34
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-[34px] w-full" aria-hidden>
      <defs>
        <linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#hero-fill)" />
      <path d={line} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
