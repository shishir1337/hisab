'use client'

import { AlertCircle, Check, Info, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Toasts (M7): one top-centre pill at a time. Same call shape as sonner's `toast(message, { action })`, so call
 * sites read the same; undo toasts get a 5 s countdown bar, identical repeats coalesce ("Saved ×2") and a new
 * toast replaces the old one. Click ✕ / swipe up to dismiss; hovering or focusing pauses the countdown.
 */
export type ToastKind = 'success' | 'undo' | 'error' | 'info'
export interface ToastAction {
  label: string
  onClick: () => void
}
export interface ToastOptions {
  action?: ToastAction
  kind?: ToastKind
  /** ms; defaults to 5 s with an action or for errors, 3.5 s otherwise. */
  duration?: number
}
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
  duration: number
  count: number
  /** Bumped on coalesce so the countdown restarts. */
  rev: number
}

let seq = 0
/** Whether the toast being replaced was swiped away (it then leaves upwards). */
let lastSwiped = false
let current: ToastItem | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function show(message: string, opts: ToastOptions = {}) {
  const kind: ToastKind = opts.kind ?? (opts.action ? (/^undo$/i.test(opts.action.label) ? 'undo' : 'info') : 'success')
  const duration = opts.duration ?? (opts.action || kind === 'error' ? 5000 : 3500)
  if (current && current.message === message && current.kind === kind) {
    // Same toast again: count it, and let one Undo undo all of them.
    const prevAction = current.action
    const next = opts.action
    const action =
      prevAction && next && prevAction.label === next.label
        ? {
            label: next.label,
            onClick: () => {
              next.onClick()
              prevAction.onClick()
            },
          }
        : (next ?? prevAction)
    current = { ...current, action, duration, count: current.count + 1, rev: current.rev + 1 }
  } else current = { id: ++seq, message, kind, action: opts.action, duration, count: 1, rev: 0 }
  emit()
  return current.id
}

export const toast = Object.assign(show, {
  success: (m: string, o?: Omit<ToastOptions, 'kind'>) => show(m, { ...o, kind: 'success' }),
  error: (m: string, o?: Omit<ToastOptions, 'kind'>) => show(m, { ...o, kind: 'error' }),
  info: (m: string, o?: Omit<ToastOptions, 'kind'>) => show(m, { ...o, kind: 'info' }),
  dismiss: (id?: number) => {
    if (current && (id === undefined || current.id === id)) {
      current = null
      emit()
    }
  },
})

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => current
const serverSnapshot = () => null

const ICON: Record<ToastKind, typeof Check> = { success: Check, undo: Undo2, error: AlertCircle, info: Info }

export function Toaster() {
  const item = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  // The outgoing toast stays rendered for its exit animation while the new one comes in.
  const [leaving, setLeaving] = useState<{ item: ToastItem; dir: 'up' | 'fade' }[]>([])
  const [shown, setShown] = useState<ToastItem | null>(item)
  if (item?.id !== shown?.id || item?.rev !== shown?.rev) {
    if (shown && item?.id !== shown.id) setLeaving((l) => [...l.slice(-1), { item: shown, dir: lastSwiped ? 'up' : 'fade' }])
    lastSwiped = false
    setShown(item)
  }
  const polite = item && item.kind !== 'error' ? `${item.message}${item.count > 1 ? ` (${item.count} times)` : ''}` : ''
  const assertive = item?.kind === 'error' ? item.message : ''

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <section aria-label="Notifications" className="toast-viewport" data-toaster>
        {leaving.map((l) => (
          <Pill key={l.item.id} item={l.item} state={l.dir === 'up' ? 'exit-up' : 'exit'} onExited={() => setLeaving((all) => all.filter((x) => x.item.id !== l.item.id))} />
        ))}
        {shown && (
          <Pill
            key={shown.id}
            item={shown}
            state="open"
            onDismiss={(swiped) => {
              lastSwiped = swiped
              toast.dismiss(shown.id)
            }}
          />
        )}
      </section>
    </>
  )
}

function Pill({ item, state, onDismiss, onExited }: { item: ToastItem; state: 'open' | 'exit' | 'exit-up'; onDismiss?: (swiped: boolean) => void; onExited?: () => void }) {
  const Icon = ICON[item.kind]
  const el = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; id: number; dy: number; t: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const open = state === 'open'

  // Bump on coalesce: a small pop so "×2" registers.
  const firstRev = useRef(item.rev)
  useEffect(() => {
    if (item.rev === firstRev.current || !el.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' })
  }, [item.rev])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!open || (e.target as HTMLElement).closest('button')) return
    drag.current = { y: e.clientY, id: e.pointerId, dy: 0, t: performance.now() }
    el.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !el.current) return
    const raw = e.clientY - d.y
    // Up follows the finger; down resists.
    d.dy = raw < 0 ? raw : raw * 0.25
    el.current.style.transition = 'none'
    el.current.style.transform = `translateY(${d.dy}px)`
    el.current.style.opacity = String(Math.max(0.2, 1 + Math.min(0, d.dy) / 80))
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !el.current) return
    const v = d.dy / Math.max(1, performance.now() - d.t)
    if (d.dy < -28 || v < -0.5) return onDismiss?.(true)
    el.current.style.transition = 'transform 250ms var(--ease-spring), opacity 150ms ease-out'
    el.current.style.transform = ''
    el.current.style.opacity = ''
    // A tap (no drag) anywhere on the pill dismisses it too.
    if (Math.abs(d.dy) < 4) onDismiss?.(false)
  }

  return (
    <div
      ref={el}
      data-state={state}
      data-kind={item.kind}
      className="toast-pill"
      onAnimationEnd={(e) => {
        if (!open && e.target === e.currentTarget) onExited?.()
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      title="Swipe up or tap to dismiss"
    >
      <span className="toast-icon" aria-hidden>
        <Icon strokeWidth={2.6} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.message}</span>
      {item.count > 1 && (
        <span key={item.count} className="toast-count num" aria-hidden>
          ×{item.count}
        </span>
      )}
      {item.action && (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          className="toast-action"
          onClick={() => {
            item.action!.onClick()
            onDismiss?.(false)
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" tabIndex={open ? 0 : -1} aria-label="Dismiss" className="toast-close" onClick={() => onDismiss?.(false)}>
        <X />
      </button>
      {/* The countdown: dismisses on animationend, so hover/focus (paused) holds it for free. */}
      {open && (
        <span
          key={item.rev}
          aria-hidden
          className={cn('toast-timer', item.action && 'toast-timer-visible')}
          style={{ ['--toast-dur' as string]: `${item.duration}ms`, animationDuration: 'var(--toast-dur)', animationPlayState: paused ? 'paused' : 'running' }}
          onAnimationEnd={(e) => {
            e.stopPropagation()
            onDismiss?.(false)
          }}
        />
      )}
    </div>
  )
}
