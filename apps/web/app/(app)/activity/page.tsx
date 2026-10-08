import type { Metadata } from 'next'
import { PageTransition } from '@/components/page-transition'
import { ActivityTable } from '@/components/activity-table'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Activity' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function ActivityPage() {
  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader title="Activity" description="Every entry, grouped by day." />
        <ActivityTable />
      </div>
    </PageTransition>
  )
}
