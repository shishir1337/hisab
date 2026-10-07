import type { Metadata } from 'next'
import { Dashboard, HomeHeader } from '@/components/dashboard'

export const metadata: Metadata = { title: 'Home' }
// Data comes from the local SQLite db in the browser, so there's nothing for the server to render instantly.
export const instant = false

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <HomeHeader />
      <Dashboard />
    </div>
  )
}
