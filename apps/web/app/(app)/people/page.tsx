import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { PeopleView } from '@/components/plan-people'

export const metadata: Metadata = { title: 'People' }

export default function PeoplePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="People" />
      <PeopleView />
    </div>
  )
}
