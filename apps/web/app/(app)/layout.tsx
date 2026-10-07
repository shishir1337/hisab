import { AppShell } from '@/components/app-shell'
import { PowerSyncProvider } from '@/lib/powersync/provider'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <PowerSyncProvider fallback={<ShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </PowerSyncProvider>
  )
}

/** Shown for the few milliseconds it takes to open the local database. */
function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy>
      <div className="hidden w-60 shrink-0 border-r border-border md:block" />
      <div className="flex-1 px-4 pt-6 md:px-10 md:pt-10">
        <div className="h-7 w-28 rounded-lg bg-surface-muted" />
        <div className="mt-6 h-44 max-w-xl rounded-hero bg-surface-muted" />
      </div>
    </div>
  )
}
