import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ReportView } from '@/components/report-view'

export const metadata: Metadata = { title: 'Monthly report' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Monthly report" />
      <ReportView />
    </div>
  )
}
