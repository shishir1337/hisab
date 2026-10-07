'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Segmented control (single choice). Arrow keys move the choice. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: ReactNode }[]
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-[12px] bg-surface-muted p-[3px] shadow-[inset_0_0_0_1px_var(--border-subtle)]', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]!
        onChange(next.value)
        const el = e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)
        el?.focus()
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-[9px] px-3 whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]',
              on
                ? 'bg-surface font-semibold text-text shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)] dark:bg-[#26272a]'
                : 'text-text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
