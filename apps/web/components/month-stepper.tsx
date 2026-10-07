'use client'

import { addMonths, monthLabel } from '@hisab/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** ‹ Oct 2026 › — one bordered control; "next" stops at the current month. */
export function MonthStepper({ month, onChange, max, className }: { month: string; onChange: (m: string) => void; max: string; className?: string }) {
  const atMax = month >= max
  return (
    <div className={cn('inline-flex h-10 items-center rounded-[12px] border border-border bg-surface p-1', className)}>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(month, -1))}
        className="grid size-8 place-items-center rounded-[9px] text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span aria-live="polite" className="num w-[92px] text-center text-[14px] font-semibold">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        disabled={atMax}
        onClick={() => onChange(addMonths(month, 1))}
        className="grid size-8 place-items-center rounded-[9px] text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
