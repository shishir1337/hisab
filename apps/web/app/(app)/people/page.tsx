import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { PeopleView } from '@/components/plan-people'

export const metadata: Metadata = { title: 'People' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function PeoplePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="People" description="Money you’ve lent and borrowed." />
      <PeopleView />
    </div>
  )
}
