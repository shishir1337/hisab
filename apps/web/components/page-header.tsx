import type { ReactNode } from 'react'

/** Page title with a one-line muted subtitle and optional actions on the right. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
