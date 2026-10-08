'use client'

import { createContext, use, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { cn } from '@/lib/utils'

interface TriggerProps {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
}

const CloseContext = createContext<() => void>(() => {})

/**
 * Small dropdown menu (no portal; anchored to its trigger). Arrow keys move, Esc / Tab / click outside close
 * and focus returns to the trigger. Not for use inside dialogs (Radix closes the dialog on Esc first).
 */
export function Menu({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className,
  wrapperClassName,
}: {
  trigger: (p: TriggerProps) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  className?: string
  wrapperClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
    items()[0]?.focus()
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        btn.current?.focus()
      } else if (e.key === 'Tab') setOpen(false)
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        const all = items()
        const i = all.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
        all[next]?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className={cn('relative', wrapperClassName)}>
      {trigger({ ref: btn, onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id })}
      {/* Always rendered so it can animate out (CSS: .menu-pop, display toggled with allow-discrete). */}
      <div
        ref={list}
        id={id}
        role="menu"
        data-open={open || undefined}
        style={{ ['--menu-origin' as string]: `${side === 'bottom' ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}` }}
        className={cn(
          'menu-pop absolute z-40 min-w-52 rounded-[14px] border border-border bg-surface p-1.5 shadow-[var(--shadow-pop)]',
          side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]',
          align === 'end' ? 'right-0' : 'left-0',
          className,
        )}
      >
        <CloseContext value={() => close()}>{children}</CloseContext>
      </div>
    </div>
  )
}

export function MenuItem({ icon, children, onSelect, trailing, tone, disabled }: { icon?: ReactNode; children: ReactNode; onSelect: () => void; trailing?: ReactNode; tone?: 'danger'; disabled?: boolean }) {
  const close = use(CloseContext)
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        close()
        onSelect()
      }}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] outline-none transition-[background-color,transform] duration-100 hover:bg-surface-muted active:scale-[0.985] focus-visible:bg-surface-muted focus-visible:outline-none disabled:opacity-40 [&>svg]:size-4 [&>svg]:shrink-0',
        tone === 'danger' ? 'text-danger' : 'text-text [&>svg]:text-text-muted',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-text-faint">{children}</div>
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1.5 my-1.5 h-px bg-border-subtle" />
}
