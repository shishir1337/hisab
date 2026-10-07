import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { PlanView } from '@/components/plan-people'

export const metadata: Metadata = { title: 'Plan' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Plan" description="Budgets, bills that repeat, and loans." />
      <PlanView />
    </div>
  )
}
