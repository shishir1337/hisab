'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

const ORDER = ['system', 'light', 'dark'] as const
const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' }

const subscribe = () => () => {}

export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme()
  // Theme is only known on the client; render a stable placeholder on the server.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const current = (mounted ? theme : 'system') as (typeof ORDER)[number]
  const Icon = ICON[current] ?? Monitor
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[current]}. Switch to ${next}.`}
      title={LABEL[current]}
      className="grid size-9 place-items-center rounded-[10px] text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
    >
      <Icon className="size-[18px]" />
    </button>
  )
}
