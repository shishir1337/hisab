'use client'

import { Command } from 'cmdk'
import { ArrowLeftRight, BarChart3, Home, ListOrdered, Minus, Moon, Plus, Settings, Target, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState, type ReactNode } from 'react'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Dialog, DialogContent } from '@/components/ui/dialog'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
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
  }, [quickLog])

  const run = (fn: () => void) => () => {
    setOpen(false)
    // Let the command dialog close before opening another one.
    setTimeout(fn, 0)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <DialogContent title="Command" hideClose className="max-w-[560px] p-0 pt-0 [&>div:first-child]:sr-only">
          <Command label="Command bar" className="overflow-hidden rounded-sheet">
            <Command.Input autoFocus placeholder="Type a command…" className="h-14 w-full border-b border-border bg-transparent px-5 text-[15px] outline-none placeholder:text-text-faint" />
            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-text-muted">No results.</Command.Empty>
              <Group heading="Log">
                <Item icon={<Minus />} onSelect={run(() => quickLog.open({ type: 'expense' }))} shortcut="N">
                  New expense
                </Item>
                <Item icon={<Plus />} onSelect={run(() => quickLog.open({ type: 'income' }))}>
                  New income
                </Item>
                <Item icon={<ArrowLeftRight />} onSelect={run(() => quickLog.open({ type: 'transfer' }))}>
                  New transfer
                </Item>
              </Group>
              <Group heading="Go to">
                <Item icon={<Home />} onSelect={run(() => router.push('/'))}>
                  Home
                </Item>
                <Item icon={<ListOrdered />} onSelect={run(() => router.push('/activity'))}>
                  Activity
                </Item>
                <Item icon={<Target />} onSelect={run(() => router.push('/plan'))}>
                  Plan
                </Item>
                <Item icon={<Users />} onSelect={run(() => router.push('/people'))}>
                  People
                </Item>
                <Item icon={<BarChart3 />} onSelect={run(() => router.push('/reports'))}>
                  Monthly report
                </Item>
                <Item icon={<Settings />} onSelect={run(() => router.push('/settings'))}>
                  Settings
                </Item>
              </Group>
              <Group heading="Preferences">
                <Item icon={<Moon />} onSelect={run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}>
                  Toggle dark mode
                </Item>
              </Group>
            </Command.List>
          </Command>
        </DialogContent>
      )}
    </Dialog>
  )
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group heading={heading} className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-faint">
      {children}
    </Command.Group>
  )
}

function Item({ icon, children, onSelect, shortcut }: { icon: ReactNode; children: string; onSelect: () => void; shortcut?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[14px] text-text data-[selected=true]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-text-muted"
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <kbd className="rounded border border-border px-1.5 text-[11px] text-text-faint">{shortcut}</kbd>}
    </Command.Item>
  )
}
