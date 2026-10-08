import { cn } from '@/lib/utils'

export type ProgressTone = 'neutral' | 'warning' | 'danger' | 'positive'

const FILL: Record<ProgressTone, string> = {
  neutral: 'bg-text/70',
  warning: 'bg-warning',
  danger: 'bg-danger',
  positive: 'bg-positive',
}

/** Thin rounded bar on a light track. Colour only carries meaning (near / over budget). */
export function Progress({ value, tone = 'neutral', label, className }: { value: number; tone?: ProgressTone; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-1.5 overflow-hidden rounded-full bg-border/70 [contain:paint] dark:bg-border', className)}
    >
      {/* Full-width fill slid left by what's missing: transform-only, and the leading edge stays round. */}
      <div className={cn('progress-fill h-full w-full rounded-full', FILL[tone])} style={{ ['--fill' as string]: `${(pct > 0 ? Math.max(pct, 1.5) : 0) - 100}%` }} />
    </div>
  )
}

/** Budget state → tone: 80 %+ warns, over the limit is danger. */
export const budgetTone = (state: 'ok' | 'near' | 'over'): ProgressTone => (state === 'over' ? 'danger' : state === 'near' ? 'warning' : 'neutral')
