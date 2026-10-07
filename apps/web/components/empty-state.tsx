import type { ReactNode } from 'react'

/** One clear next action, no illustrations (spec §7.3). */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
