import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'
import { BrandTile } from '@/components/ui/brand-tile'
import { RetryButton } from './retry-button'

export const metadata: Metadata = { title: 'Offline' }

/**
 * Served by the service worker when a page that was never opened on this device is requested without a
 * network. Pages that were opened before (Home, Activity, …) come from the cache and work offline as usual.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <BrandTile className="size-14" />
      <span aria-hidden className="mt-8 grid size-11 place-items-center rounded-full border border-border bg-surface text-text-muted">
        <WifiOff className="size-5" />
      </span>
      <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.025em]">You’re offline</h1>
      <p className="mt-2 max-w-[320px] text-[14px] leading-[21px] text-text-muted">
        This page hasn’t been opened on this device yet. Your entries are saved on this device and sync when you’re back online.
      </p>
      <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2.5">
        {/* A plain link: a full load, which the service worker answers from its cache. */}
        <a href="/" className="flex h-12 items-center justify-center rounded-[14px] bg-brand text-[15px] font-semibold text-brand-fg active:scale-[0.98]">
          Open Home
        </a>
        <RetryButton />
      </div>
    </main>
  )
}
