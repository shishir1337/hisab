import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Settings" />
      <EmptyState title="Nothing here yet" description="Accounts, categories and preferences." />
    </div>
  )
}
