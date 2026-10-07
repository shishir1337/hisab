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
  hideHeader,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  hideClose?: boolean
  /** Keep the title for screen readers only (e.g. the command bar). */
  hideHeader?: boolean
}) {
  return (
    <D.Portal>
      <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'dialog-content fixed top-[max(16px,5vh)] left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-sheet border border-border bg-surface p-5 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] outline-none md:top-[12vh] md:max-h-[80vh] md:p-6 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_24px_64px_-12px_rgb(0_0_0/0.8)]',
          className,
        )}
      >
        <div className={cn('mb-5 flex items-start justify-between gap-4', hideHeader && 'sr-only')}>
          <div className="min-w-0">
            <D.Title className="text-[17px] font-semibold tracking-[-0.015em]">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[13px] leading-5 text-text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {!hideClose && (
            <D.Close className="-mt-1 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-[10px] text-text-faint transition-colors hover:bg-surface-muted hover:text-text" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  )
}

/** Labelled form field: label above, optional hint below. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[12.5px] font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-text-faint">{hint}</span>}
    </label>
  )
}
