import { AppShell } from '@/components/app-shell'
import { CommandBar } from '@/components/command-bar'
import { AppPwa } from '@/components/pwa/app-pwa'
import { QuickLogProvider } from '@/components/quick-log/quick-log'
import { PowerSyncProvider } from '@/lib/powersync/provider'
import { PrivacyProvider } from '@/lib/privacy'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <PowerSyncProvider fallback={<ShellSkeleton />}>
      <PrivacyProvider>
        <QuickLogProvider>
          <AppShell>{children}</AppShell>
          <CommandBar />
          <AppPwa />
        </QuickLogProvider>
      </PrivacyProvider>
    </PowerSyncProvider>
  )
}

/** Shown for the moment it takes to open the local database; mirrors the shell so nothing jumps. */
function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy aria-label="Loading">
      <div className="hidden w-[240px] shrink-0 flex-col gap-2 border-r border-border px-3 pt-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2.5 py-1">
          <div className="size-8 rounded-[10px] bg-brand" />
          <div className="skeleton h-4 w-14" />
        </div>
        <div className="mb-5 h-10 rounded-[12px] bg-brand/90" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-9 items-center gap-3 px-2.5">
            <div className="skeleton size-[18px] rounded-[5px]" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="flex-1">
        <div className="h-[calc(56px+env(safe-area-inset-top))] border-b border-border md:hidden" />
        <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8 md:pt-10 lg:px-10">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton mt-2.5 h-4 w-36" />
          <div className="mt-6 grid gap-5 md:mt-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-6">
            <div className="flex flex-col gap-5 lg:gap-6">
              <div className="hero-card h-[236px] rounded-hero opacity-90" />
              <div className="h-48 rounded-card border border-border bg-surface" />
            </div>
            <div className="hidden h-[400px] rounded-card border border-border bg-surface lg:block" />
          </div>
        </div>
      </div>
    </div>
  )
}
