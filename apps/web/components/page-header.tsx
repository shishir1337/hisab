import type { ReactNode } from 'react'

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 md:mb-8">
      <h1 className="text-[22px] font-bold tracking-tight md:text-[26px]">{title}</h1>
      {actions}
    </div>
  )
}
