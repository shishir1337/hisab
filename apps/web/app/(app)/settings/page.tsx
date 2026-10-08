import type { Metadata } from 'next'
import { PageTransition } from '@/components/page-transition'
import { PageHeader } from '@/components/page-header'
import { SettingsView } from '@/components/settings-view'

export const metadata: Metadata = { title: 'Settings' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader title="Settings" description="Accounts, preferences and your data." />
        <SettingsView />
      </div>
    </PageTransition>
  )
}
