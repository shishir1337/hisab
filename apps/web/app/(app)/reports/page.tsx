import type { Metadata } from 'next'
import { PageTransition } from '@/components/page-transition'
import { PageHeader } from '@/components/page-header'
import { ReportView } from '@/components/report-view'

export const metadata: Metadata = { title: 'Monthly report' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function ReportsPage() {
  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader title="Monthly report" description="Where the money came from and where it went." />
        <ReportView />
      </div>
    </PageTransition>
  )
}
