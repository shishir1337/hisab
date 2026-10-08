'use client'

import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

/** Phone widths (below Tailwind's `md`): dialogs present as bottom sheets. Keep in sync with globals.css. */
export const SHEET_QUERY = '(max-width: 767.98px)'

export function DialogContent({
  title,
  description,
  children,
  className,
  hideClose,
  hideHeader,
  variant = 'auto',
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  hideClose?: boolean
  /** Keep the title for screen readers only (e.g. the command bar). */
  hideHeader?: boolean
  /** `auto`: a centred dialog on wide screens, a bottom sheet on phones. `center`: always centred (command bar). */
  variant?: 'auto' | 'center'
}) {
  const content = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  return (
    <D.Portal>
      <D.Overlay ref={overlay} className="dialog-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
      <D.Content
        ref={content}
        data-variant={variant}
        className={cn(
          'dialog-content fixed top-[max(16px,5vh)] left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-sheet border border-border bg-surface p-5 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] outline-none md:top-[12vh] md:max-h-[80vh] md:p-6 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_24px_64px_-12px_rgb(0_0_0/0.8)]',
          variant === 'auto' && 'sheet',
          className,
        )}
      >
        {variant === 'auto' && <div className="sheet-grabber" data-sheet-handle aria-hidden />}
        <div data-sheet-handle className={cn('mb-5 flex items-start justify-between gap-4', hideHeader && 'sr-only')}>
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
        {/* Programmatic close for gestures and the back button (keeps Radix in charge of open state). */}
        <D.Close ref={close} tabIndex={-1} aria-hidden className="hidden" />
        {variant === 'auto' && <SheetBehavior content={content} overlay={overlay} close={close} />}
        {children}
      </D.Content>
    </D.Portal>
  )
}

/** Mounts and unmounts with the open content (DialogContent itself may stay rendered while closed). */
function SheetBehavior({ content, overlay, close }: { content: React.RefObject<HTMLDivElement | null>; overlay: React.RefObject<HTMLDivElement | null>; close: React.RefObject<HTMLButtonElement | null> }) {
  useSheetGestures(content, overlay, close, true)
  useBackButtonCloses(close, true)
  return null
}

const isSheet = (el: HTMLElement) => el.classList.contains('sheet') && window.matchMedia(SHEET_QUERY).matches

/**
 * Swipe down to dismiss, like a native sheet: drag from the grabber/header any time, or from the body once it
 * is scrolled to the top. Follows the finger (resisting upwards), the backdrop fades with it, and on release it
 * either closes (pulled past 30 % or flicked down) or springs back. Touch only; mouse users have ✕ / Esc.
 */
function useSheetGestures(content: React.RefObject<HTMLDivElement | null>, overlay: React.RefObject<HTMLDivElement | null>, close: React.RefObject<HTMLButtonElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = content.current
    if (!enabled || !el) return
    let start: { y: number; x: number; fromHandle: boolean; scrollTop: number } | null = null
    let dragging = false
    let dy = 0
    let samples: { y: number; t: number }[] = []
    let armed = false

    const reset = () => {
      start = null
      dragging = false
      dy = 0
      samples = []
      armed = false
    }
    const setOffset = (y: number) => {
      el.style.transform = `translate3d(0, ${y}px, 0)`
      const o = overlay.current
      if (o) o.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / (el.offsetHeight || 1)))
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !isSheet(el)) return
      const t = e.touches[0]
      const target = e.target as HTMLElement
      // Leave sliders, horizontal scrollers and text selection inside inputs alone.
      if (target.closest('input[type=range], [data-no-sheet-drag]')) return
      start = { y: t.clientY, x: t.clientX, fromHandle: Boolean(target.closest('[data-sheet-handle]')), scrollTop: el.scrollTop }
      samples = [{ y: t.clientY, t: e.timeStamp }]
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      const raw = t.clientY - start.y
      if (!dragging) {
        const dx = Math.abs(t.clientX - start.x)
        // Only a downward, mostly vertical pull that the content can't use for scrolling becomes a drag.
        if (raw > 8 && raw > dx * 1.2 && (start.fromHandle || (start.scrollTop <= 0 && el.scrollTop <= 0))) {
          dragging = true
          start.y = t.clientY
          el.style.transition = 'none'
          if (overlay.current) overlay.current.style.transition = 'none'
          ;(document.activeElement as HTMLElement | null)?.blur?.()
        } else if (Math.abs(raw) > 8 || dx > 8) {
          start = null
          return
        } else return
      }
      e.preventDefault()
      const d = t.clientY - start.y
      dy = d > 0 ? d : -Math.sqrt(-d) * 2
      setOffset(dy)
      samples.push({ y: t.clientY, t: e.timeStamp })
      if (samples.length > 5) samples.shift()
      const past = dy > el.offsetHeight * 0.3
      if (past !== armed) {
        armed = past
        if (past) haptic('selection')
      }
    }
    const onEnd = () => {
      if (!start || !dragging) return reset()
      const first = samples[0]
      const last = samples[samples.length - 1]
      const v = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      const dismiss = dy > el.offsetHeight * 0.3 || (v > 0.55 && dy > 24)
      el.style.transition = ''
      if (overlay.current) overlay.current.style.transition = ''
      if (dismiss) {
        haptic('light')
        // Keep the current offset: the closing animation (.sheet[data-state=closed]) continues from here.
        el.dataset.dragClosing = ''
        close.current?.click()
      } else {
        el.style.transition = 'transform 320ms var(--ease-spring-soft)'
        el.style.transform = ''
        if (overlay.current) {
          overlay.current.style.transition = 'opacity 200ms var(--ease-out)'
          overlay.current.style.opacity = ''
        }
      }
      reset()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [content, overlay, close, enabled])
}

/**
 * Android's back button / back gesture (and browser Back) closes an open sheet instead of leaving the page:
 * opening pushes a same-URL history entry (keeping Next's router state in it); Back pops it and we close. If the
 * sheet is closed any other way, its entry is removed again so history stays as it was.
 */
function useBackButtonCloses(close: React.RefObject<HTMLButtonElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !window.matchMedia(SHEET_QUERY).matches) return
    const id = Math.random().toString(36).slice(2)
    let pushed = false
    let popped = false
    // Deferred a tick: Strict Mode's mount → unmount → mount must not leave a stray entry or a pending back().
    const timer = setTimeout(() => {
      window.history.pushState({ ...window.history.state, __hisabSheet: id }, '')
      pushed = true
    }, 0)
    const onPop = () => {
      if (window.history.state?.__hisabSheet === id) return
      popped = true
      close.current?.click()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      if (!pushed) return
      // Closed by ✕ / Esc / backdrop / swipe / save: drop our entry (unless a navigation already replaced it).
      if (!popped && window.history.state?.__hisabSheet === id) window.history.back()
    }
  }, [close, enabled])
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
