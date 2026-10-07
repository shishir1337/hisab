import type { Metadata } from 'next'
import { BalanceHero } from '@/components/balance-hero'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Home' }

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Home" />
      <div className="max-w-xl">
        <BalanceHero />
      </div>
    </div>
  )
}
