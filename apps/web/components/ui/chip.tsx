import { ChevronDown } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Choice chip. Selected = ink fill; unselected = quiet outline. */
export function Chip({ selected, icon, children, className, size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'chip inline-flex shrink-0 items-center gap-1.5 rounded-full border whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9 px-3.5 text-[13px]',
        selected
          ? 'border-brand bg-brand font-semibold text-brand-fg'
          : 'border-border bg-surface text-text hover:border-text-faint/50 hover:bg-surface-muted',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

/** Native select, styled: the OS picker is the best UX on phones, and it's fully keyboard accessible. */
export function Select({ className, wrapperClassName, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={cn('relative inline-flex', wrapperClassName)}>
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-[12px] border border-border bg-surface pr-9 pl-3 text-[14px] text-text transition-[border-color,box-shadow] duration-150 outline-none hover:border-text-faint/50 focus-visible:border-text-faint focus-visible:ring-4 focus-visible:ring-brand/[0.06]',
          className,
        )}
        {...props}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-faint" />
    </span>
  )
}

/** Compact pill-shaped select for filter rows; filled when a filter is active. */
export function PillSelect({ active, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { active?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        className={cn(
          'h-9 max-w-[200px] appearance-none truncate rounded-full border pr-8 pl-3.5 text-[13px] transition-[background-color,border-color,color] duration-150 outline-none',
          active ? 'border-brand bg-brand font-semibold text-brand-fg' : 'border-border bg-surface text-text hover:border-text-faint/50 hover:bg-surface-muted',
          className,
        )}
        {...props}
      />
      <ChevronDown aria-hidden className={cn('pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2', active ? 'text-brand-fg/70' : 'text-text-faint')} />
    </span>
  )
}
