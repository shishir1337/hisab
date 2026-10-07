'use client'

import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  title,
  description,
  children,
  className,
  hideClose,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  hideClose?: boolean
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[520px] -translate-x-1/2 rounded-sheet border border-border bg-surface p-5 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)] outline-none',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-[17px] font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {!hideClose && (
            <D.Close className="grid size-9 place-items-center rounded-[10px] text-text-muted hover:bg-surface-muted hover:text-text" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  )
}
