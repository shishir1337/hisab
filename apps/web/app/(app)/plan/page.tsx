import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Plan' }

export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Plan" />
      <EmptyState title="Nothing here yet" description="Budgets, recurring items and loans will live here." />
    </div>
  )
}
