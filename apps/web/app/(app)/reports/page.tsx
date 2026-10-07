import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Reports' }

export default function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Reports" />
      <EmptyState title="Nothing here yet" description="Your monthly report will appear here." />
    </div>
  )
}
