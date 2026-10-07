import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { PlanView } from '@/components/plan-people'

export const metadata: Metadata = { title: 'Plan' }

export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Plan" />
      <PlanView />
    </div>
  )
}
