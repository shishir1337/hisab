'use client'

import { BarChart3, Home, ListOrdered, LogOut, Plus, Settings, Target, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { SyncPill } from '@/components/sync-pill'
import { ThemeToggle } from '@/components/theme-toggle'
import { getSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/activity', label: 'Activity', icon: ListOrdered },
  { href: '/plan', label: 'Plan', icon: Target },
  { href: '/people', label: 'People', icon: Users },
] as const

const SECONDARY = [
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const quickLog = useQuickLog()

  const signOut = async () => {
    await getSupabase().auth.signOut()
    router.replace('/sign-in')
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (md+) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border px-3 py-5 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-[14px] font-bold text-brand-fg">
            H
          </span>
          <span className="text-[16px] font-semibold tracking-tight">Hisab</span>
        </Link>
        <button
          onClick={() => quickLog.open()}
          className="mb-4 flex h-10 items-center gap-2 rounded-[12px] bg-brand px-3 text-[14px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Log money
          <kbd className="ml-auto rounded bg-white/15 px-1.5 text-[11px] font-medium">N</kbd>
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
          <div className="my-3 h-px bg-border" />
          {SECONDARY.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-1">
          <SyncPill />
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              onClick={signOut}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] px-2.5 text-[13px] text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header (mobile web) */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-page/90 px-4 backdrop-blur md:hidden">
          <span className="text-[16px] font-semibold tracking-tight">Hisab</span>
          <div className="flex items-center gap-1">
            <SyncPill compact />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-12">{children}</main>
      </div>

      <button
        onClick={() => quickLog.open()}
        aria-label="Log money"
        className="fixed right-4 bottom-[88px] z-30 grid size-14 print:hidden place-items-center rounded-full bg-brand text-brand-fg shadow-[0_10px_24px_rgba(0,0,0,0.25)] md:hidden"
      >
        <Plus className="size-6" />
      </button>

      {/* Bottom tabs (mobile web) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex h-[72px] items-start justify-around border-t border-border bg-page/95 pt-2.5 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn('flex min-w-16 flex-col items-center gap-1 text-[10.5px]', active ? 'font-semibold text-text' : 'text-text-faint')}
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof Home
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center gap-3 rounded-[11px] px-2.5 text-[14px] transition-colors',
        active ? 'bg-surface font-semibold text-text shadow-[0_0_0_1px_var(--border)]' : 'text-text-muted hover:bg-surface-muted hover:text-text',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  )
}
