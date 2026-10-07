import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'People' }

export default function PeoplePage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="People" />
      <EmptyState title="Nothing here yet" description="People and companies you deal with, and who owes whom." />
    </div>
  )
}
