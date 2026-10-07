import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { SettingsView } from '@/components/settings-view'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Settings" />
      <SettingsView />
    </div>
  )
}
