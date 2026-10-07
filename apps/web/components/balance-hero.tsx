'use client'

import { Q } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { Money } from '@/components/money'

/** Ink hero card (spec §7.3) with the live total from local SQLite. */
export function BalanceHero() {
  const { data } = useQuery<{ total: number }>(Q.totalBalance)
  const total = data[0]?.total ?? 0
  return (
    <section aria-label="Balance" className="hero-card relative overflow-hidden rounded-hero p-5 md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full bg-[radial-gradient(rgba(255,255,255,0.10),transparent_70%)]"
      />
      <p className="text-[12px] text-white/60">Total balance</p>
      <Money minor={total} currency="BDT" showDecimals="always" className="mt-0.5 block text-[32px] leading-tight font-semibold" />
      <div className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.07] px-3 py-2">
          <p className="text-white/55">Owed to you</p>
          <Money minor={0} currency="BDT" className="font-semibold" />
        </div>
        <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.07] px-3 py-2">
          <p className="text-white/55">Loans left</p>
          <Money minor={0} currency="BDT" className="font-semibold" />
        </div>
      </div>
    </section>
  )
}
