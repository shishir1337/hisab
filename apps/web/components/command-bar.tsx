'use client'

import { Command } from 'cmdk'
import { ArrowLeftRight, BarChart3, Eye, EyeOff, Home, ListOrdered, Minus, Moon, Plus, Search, Settings, Sun, Target, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState, type ReactNode } from 'react'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Kbd } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { usePrivacy } from '@/lib/privacy'

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

/** ⌘K / Ctrl+K command bar and the global N (new entry) shortcut (spec §7.2). */
export function CommandBar() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const quickLog = useQuickLog()
  const { resolvedTheme, setTheme } = useTheme()
  const { hidden, toggle } = usePrivacy()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // Don't stack on top of another dialog (e.g. quick log).
        if (!open && document.querySelector('[role="dialog"]')) return
        setOpen((o) => !o)
        return
      }
      // N opens quick log — never while typing or while another dialog is open.
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        quickLog.open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickLog, open])

  const run = (fn: () => void) => () => {
    setOpen(false)
    // Let the command dialog close before opening another one.
    setTimeout(fn, 0)
  }

  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <DialogContent title="Command" hideClose hideHeader className="max-w-[560px] overflow-hidden p-0 md:p-0">
          <Command label="Command bar" loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-5">
              <Search className="size-[18px] shrink-0 text-text-faint" aria-hidden />
              <Command.Input autoFocus placeholder="Type a command…" className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-text-faint" />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[min(380px,60vh)] scroll-py-2 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-[13px] text-text-muted">No matching commands.</Command.Empty>
              <Group heading="Log">
                <Item icon={<Minus />} onSelect={run(() => quickLog.open({ type: 'expense' }))} shortcut="N" keywords={['spend', 'add', 'expense']}>
                  New expense
                </Item>
                <Item icon={<Plus />} onSelect={run(() => quickLog.open({ type: 'income' }))} keywords={['salary', 'add']}>
                  New income
                </Item>
                <Item icon={<ArrowLeftRight />} onSelect={run(() => quickLog.open({ type: 'transfer' }))} keywords={['move']}>
                  New transfer
                </Item>
              </Group>
              <Group heading="Go to">
                <Item icon={<Home />} onSelect={run(() => router.push('/'))}>
                  Home
                </Item>
                <Item icon={<ListOrdered />} onSelect={run(() => router.push('/activity'))} keywords={['transactions', 'history']}>
                  Activity
                </Item>
                <Item icon={<Target />} onSelect={run(() => router.push('/plan'))} keywords={['budgets', 'recurring', 'loans', 'emi']}>
                  Plan
                </Item>
                <Item icon={<Users />} onSelect={run(() => router.push('/people'))} keywords={['lending', 'borrow']}>
                  People
                </Item>
                <Item icon={<BarChart3 />} onSelect={run(() => router.push('/reports'))} keywords={['reports', 'pdf', 'csv']}>
                  Monthly report
                </Item>
                <Item icon={<Settings />} onSelect={run(() => router.push('/settings'))} keywords={['accounts', 'currency', 'export']}>
                  Settings
                </Item>
              </Group>
              <Group heading="Preferences">
                <Item icon={resolvedTheme === 'dark' ? <Sun /> : <Moon />} onSelect={run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))} keywords={['theme', 'dark', 'light']}>
                  {resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                </Item>
                <Item icon={hidden ? <Eye /> : <EyeOff />} onSelect={run(toggle)} keywords={['privacy', 'mask']}>
                  {hidden ? 'Show amounts' : 'Hide amounts'}
                </Item>
              </Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-border-subtle bg-surface-muted/40 px-5 py-2.5 text-[12px] text-text-faint max-md:hidden">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> to run
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>{mod}</Kbd>
                <Kbd>K</Kbd> to toggle
              </span>
            </div>
          </Command>
        </DialogContent>
      )}
    </Dialog>
  )
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 last:mb-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-faint"
    >
      {children}
    </Command.Group>
  )
}

function Item({ icon, children, onSelect, shortcut, keywords }: { icon: ReactNode; children: string; onSelect: () => void; shortcut?: string; keywords?: string[] }) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords}
      className="group flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[14px] text-text transition-colors duration-75 data-[selected=true]:bg-surface-muted"
    >
      <span className="grid size-7 place-items-center rounded-[8px] border border-border bg-surface text-text-muted group-data-[selected=true]:text-text [&_svg]:size-[15px]">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  )
}
