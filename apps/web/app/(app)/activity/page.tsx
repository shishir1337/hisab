import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Activity' }

export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Activity" />
      <EmptyState title="Nothing here yet" description="Every transaction, grouped by day, will appear here." />
    </div>
  )
}
