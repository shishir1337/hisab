import { cn } from '@/lib/utils'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = Array.from(parts[0]!)[0] ?? ''
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Neutral initials avatar (no random colours — colour is reserved for meaning). */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full border border-border bg-surface-muted font-semibold text-text-muted select-none',
        size === 'sm' && 'size-8 text-[11.5px]',
        size === 'md' && 'size-9 text-[12.5px]',
        size === 'lg' && 'size-11 text-[14px]',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
