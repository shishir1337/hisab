import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Chip({ selected, icon, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none',
        selected ? 'border-brand bg-brand font-semibold text-brand-fg' : 'border-border bg-surface-muted text-text hover:bg-border',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 rounded-[12px] border border-border bg-surface px-3 text-[14px] text-text outline-none focus:border-text-faint focus:ring-4 focus:ring-brand/[0.06]',
        className,
      )}
      {...props}
    />
  )
}
