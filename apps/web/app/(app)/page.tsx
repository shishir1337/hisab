import type { Metadata } from 'next'
import { Dashboard } from '@/components/dashboard'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Home' }

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Home" />
      <Dashboard />
    </div>
  )
}
