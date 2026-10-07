'use client'

import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  describedBy,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label?: string
  id?: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-brand' : 'bg-border dark:bg-[#2c2d31]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block size-5 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out',
          checked ? 'translate-x-[18px] bg-brand-fg' : 'translate-x-[2px] bg-white dark:bg-text-muted',
        )}
      />
    </button>
  )
}
