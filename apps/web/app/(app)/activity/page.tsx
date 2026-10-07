import type { Metadata } from 'next'
import { ActivityTable } from '@/components/activity-table'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Activity' }

export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Activity" />
      <ActivityTable />
    </div>
  )
}
