'use client'

import { addDays, balanceSeries, loanProgress } from '@hisab/core'
import { Q, QL, QP, type LoanWithPayments } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { Eye, EyeOff } from 'lucide-react'
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
      className="hero-card group relative cursor-pointer overflow-hidden rounded-hero p-5 select-none md:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-[radial-gradient(rgba(255,255,255,0.09),transparent_70%)]" />
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-white/60">Total balance</p>
        <span aria-hidden className="grid size-7 place-items-center rounded-full text-white/45 transition-colors group-hover:bg-white/10 group-hover:text-white/80">
          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </span>
      </div>
      <Money minor={total} currency={currency} grouping={grouping} className="mt-1 block text-[34px] leading-tight font-semibold tracking-[-0.03em] md:text-[38px]" />
      {hidden ? <div className="mt-3 h-[36px]" aria-hidden /> : <Sparkline values={series} />}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Tile label="Owed to you">
          <Money minor={owed} currency={currency} grouping={grouping} className={owed > 0 ? 'text-[#4ADE80]' : undefined} />
        </Tile>
        <Tile label="Loans left">
          <Money minor={loansLeft} currency={currency} grouping={grouping} />
        </Tile>
      </div>
    </section>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-3.5 py-2.5">
      <p className="text-[12px] text-white/55">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold">{children}</p>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 300
  const h = 36
  const min = Math.min(...values)
  const span = Math.max(...values) - min
  // A flat month draws a calm line through the middle rather than along the floor.
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, span ? h - 3 - ((v - min) / span) * (h - 6) : h / 2] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-[36px] w-full" aria-hidden>
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
