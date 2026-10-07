import { ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const TINTS = new Set(['amber', 'green', 'blue', 'violet', 'rose', 'teal', 'orange', 'slate'])

/** Emoji on a soft tinted tile (same tints as the phone app). */
export function CategoryIcon({ icon, color, size = 'md', transfer, className }: { icon?: string | null; color?: string | null; size?: 'sm' | 'md' | 'lg'; transfer?: boolean; className?: string }) {
  const tint = color && TINTS.has(color) ? color : 'slate'
  return (
    <span
      aria-hidden
      style={{ background: transfer ? undefined : `var(--tint-${tint})` }}
      className={cn(
        'grid shrink-0 place-items-center leading-none select-none',
        size === 'sm' && 'size-7 rounded-[8px] text-[13px]',
        size === 'md' && 'size-9 rounded-tile text-[16px]',
        size === 'lg' && 'size-10 rounded-[12px] text-[18px]',
        transfer && 'bg-surface-muted text-text-muted',
        className,
      )}
    >
      {transfer ? <ArrowLeftRight className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : (icon ?? '•')}
    </span>
  )
}
