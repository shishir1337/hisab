'use client'

import { BarChart3, Check, ChevronsUpDown, Download, Eye, EyeOff, Home, ListOrdered, LogOut, Monitor, Moon, Plus, Settings, Sun, Target, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useInstallAction } from '@/components/pwa/install'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { SyncStatus } from '@/components/sync-pill'
import { Avatar } from '@/components/ui/avatar'
import { BrandTile } from '@/components/ui/brand-tile'
import { Kbd } from '@/components/ui/button'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu'
import { haptic } from '@/lib/haptics'
import { usePrivacy } from '@/lib/privacy'
import { useProfile, useUserEmail } from '@/lib/profile'
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
  const quickLog = useQuickLog()
  // The tab pill starts sliding on tap (like the Android tab bar), not when the next page has rendered.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const [moved, setMoved] = useState(false)
  if (pending && pending.from !== pathname) setPending(null)
  const tabPath = pending && pending.from === pathname ? pending.to : pathname
  const side = useIndicator(pathname)
  const tabs = useIndicator(tabPath)

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (md+) */}
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-border px-3 pt-5 pb-3 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 self-start rounded-[10px] px-2.5 py-1">
          <Logo />
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Hisab</span>
        </Link>
        <button
          onClick={() => quickLog.open()}
          className="mb-5 flex h-10 items-center gap-2 rounded-[12px] bg-brand pr-2 pl-3 text-[14px] font-semibold text-brand-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-opacity duration-150 hover:opacity-90 active:scale-[0.99]"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Log money
          <Kbd inverted className="ml-auto">
            N
          </Kbd>
        </button>
        <nav ref={side.nav} className="relative flex flex-col gap-0.5" aria-label="Main">
          <span
            ref={side.indicator}
            aria-hidden
            className="nav-indicator pointer-events-none absolute top-0 left-0 rounded-[10px] bg-surface opacity-0 shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04)]"
          />
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
          <div className="mx-2.5 my-3 h-px bg-border" />
          {SECONDARY.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-auto">
          <AccountMenu variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header (phone width) */}
        <header className="app-header sticky top-0 z-20 flex h-[calc(56px+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-border bg-page/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md backdrop-saturate-150 md:hidden">
          <Link href="/" className="flex items-center gap-2 rounded-[10px]">
            <Logo small />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">Hisab</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <SyncStatus />
            <AccountMenu variant="header" />
          </div>
        </header>
        <main className="flex-1 px-4 pt-6 pb-[calc(112px+env(safe-area-inset-bottom))] md:px-8 md:pt-10 md:pb-16 lg:px-10">{children}</main>
      </div>

      <button
        onClick={() => {
          haptic('light')
          quickLog.open()
        }}
        aria-label="Log money"
        className="fab fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-[18px] bg-brand text-brand-fg shadow-[0_8px_24px_-4px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.15)] transition-transform duration-150 active:scale-95 md:hidden print:hidden"
      >
        <Plus className="size-6" strokeWidth={2.2} />
      </button>

      {/* Bottom tabs (phone width) */}
      <nav
        ref={tabs.nav}
        aria-label="Main"
        data-moved={moved || undefined}
        className="tab-bar fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 md:hidden"
      >
        <span
          ref={tabs.indicator}
          aria-hidden
          className="nav-indicator pointer-events-none absolute top-0 left-0 rounded-full bg-border opacity-0 dark:bg-surface-muted"
        />
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(tabPath, href)
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isActive(pathname, href)) return
                haptic('selection')
                setPending({ from: pathname, to: href })
                setMoved(true)
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200 active:[&>span]:scale-90',
                active ? 'font-semibold text-text' : 'text-text-faint',
              )}
            >
              <span data-indicator-anchor className="grid h-[30px] w-14 place-items-center rounded-full transition-transform duration-150 ease-out">
                <Icon className={cn('size-[20px]', active && 'tab-icon-pop')} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function Logo({ small }: { small?: boolean }) {
  return <BrandTile className={cn('shadow-[0_1px_2px_rgb(0_0_0/0.12)]', small ? 'size-7 rounded-[9px]' : 'size-8 rounded-[10px]')} />
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      data-indicator-anchor
      className={cn(
        'relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[14px] transition-colors duration-150',
        active ? 'font-semibold text-text' : 'text-text-muted hover:bg-surface-muted hover:text-text',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  )
}

/**
 * One indicator per nav that slides to the active item (sidebar highlight, phone tab pill), instead of
 * each item switching its own background. Measures the active `[data-indicator-anchor]`; first placement
 * is instant.
 */
function useIndicator(pathname: string) {
  const nav = useRef<HTMLElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const n = nav.current
    const el = indicator.current
    if (!n || !el) return
    const place = () => {
      const target = n.querySelector<HTMLElement>('[aria-current="page"][data-indicator-anchor], [aria-current="page"] [data-indicator-anchor]')
      if (!target || n.getClientRects().length === 0) {
        el.style.opacity = '0'
        return
      }
      const nr = n.getBoundingClientRect()
      const tr = target.getBoundingClientRect()
      const first = el.dataset.placed !== '1'
      if (first) el.style.transition = 'none'
      el.style.width = `${tr.width}px`
      el.style.height = `${tr.height}px`
      el.style.transform = `translate(${tr.left - nr.left - n.clientLeft}px, ${tr.top - nr.top - n.clientTop}px)`
      el.style.opacity = '1'
      if (first) {
        void el.offsetWidth
        el.style.transition = ''
        el.dataset.placed = '1'
      }
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(n)
    return () => ro.disconnect()
  }, [pathname])
  return { nav, indicator }
}

const subscribe = () => () => {}
const THEMES = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const

/** Account block: who's signed in, sync state, and a menu (settings, theme, hide amounts, sign out). */
function AccountMenu({ variant }: { variant: 'sidebar' | 'header' }) {
  const router = useRouter()
  const { displayName } = useProfile()
  const email = useUserEmail()
  const { hidden, toggle } = usePrivacy()
  const { theme = 'system', setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const name = displayName || email?.split('@')[0] || 'You'

  const install = useInstallAction()
  const signOut = async () => {
    await getSupabase().auth.signOut()
    router.replace('/sign-in')
    router.refresh()
  }

  const items = (
    <>
      <MenuLabel>
        <span className="block truncate">{email ?? 'Signed in'}</span>
      </MenuLabel>
      <MenuSeparator />
      {variant === 'header' && (
        <MenuItem icon={<BarChart3 />} onSelect={() => router.push('/reports')}>
          Reports
        </MenuItem>
      )}
      <MenuItem icon={<Settings />} onSelect={() => router.push('/settings')}>
        Settings
      </MenuItem>
      <MenuItem icon={hidden ? <Eye /> : <EyeOff />} onSelect={toggle}>
        {hidden ? 'Show amounts' : 'Hide amounts'}
      </MenuItem>
      {install && (
        <MenuItem icon={<Download />} onSelect={install}>
          Install Hisab
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuLabel>Appearance</MenuLabel>
      {THEMES.map((t) => (
        <MenuItem key={t.value} icon={<t.icon />} onSelect={() => setTheme(t.value)} trailing={mounted && theme === t.value ? <Check className="size-4 text-text" /> : null}>
          {t.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<LogOut />} onSelect={() => void signOut()}>
        Sign out
      </MenuItem>
    </>
  )

  if (variant === 'header')
    return (
      <Menu
        title="Account and settings"
        trigger={(p) => (
          <button {...p} aria-label="Account and settings" className="grid size-9 place-items-center rounded-full">
            <Avatar name={name} size="sm" />
          </button>
        )}
      >
        {items}
      </Menu>
    )

  return (
    <Menu
      side="top"
      align="start"
      className="w-full"
      trigger={(p) => (
        <button
          {...p}
          aria-label="Account and settings"
          className="flex w-full items-center gap-2.5 rounded-[12px] p-2 text-left transition-colors duration-150 hover:bg-surface-muted aria-expanded:bg-surface-muted"
        >
          <Avatar name={name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold" title={name}>
              {name}
            </span>
            <SyncStatus className="max-w-full" />
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-faint" />
        </button>
      )}
    >
      {items}
    </Menu>
  )
}
