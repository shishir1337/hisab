import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The one card used everywhere: 1px border, white surface, aligned "Title ……… action" header. */
export function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-card border border-border bg-surface', className)}>
      {(title || action) && (
        <header className="flex min-h-[52px] items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {description && <p className="truncate text-[12.5px] text-text-faint">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </header>
      )}
      <div className={cn('px-5 pb-5', !(title || action) && 'pt-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="card-link -mr-1 px-1 py-0.5">
      {children}
      <ChevronRight className="size-3.5 opacity-70" aria-hidden />
    </Link>
  )
}

/** Honest empty state: what's missing, and what to do about it. */
export function EmptyState({
  icon,
  illustration,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  /** A small drawing (components/ui/illustrations) in place of the icon. */
  illustration?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('empty-state flex flex-col items-center px-4 py-8 text-center', className)}>
      {illustration ? <div className="empty-art mb-3">{illustration}</div> : icon && <div className="mb-3 grid size-11 place-items-center rounded-full bg-surface-muted text-[20px] text-text-muted [&_svg]:size-5">{icon}</div>}
      <p className="text-[14px] font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-[34ch] text-[13px] leading-5 text-text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
