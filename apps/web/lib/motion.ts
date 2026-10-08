'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** JS-side mirror of the CSS motion tokens in globals.css. */
export const DUR = { instant: 100, fast: 150, base: 200, slow: 250, count: 400 } as const
export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.55, 0, 1, 0.45)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Small horizontal shake: "that didn't go through". No-op with reduced motion. */
export function shake(el: Element | null | undefined) {
  if (!el || reducedMotion()) return
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
    { duration: 340, easing: 'ease-out' },
  )
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * Animates a number towards `target` (~400 ms, ease-out) whenever it changes. Values arriving on page load
 * (from 0, or within 700 ms of mount) are shown as is, and `enabled: false` (e.g. amounts hidden) or reduced motion jumps straight there.
 */
export function useCountUp(target: number, enabled = true): number {
  const [shown, setShown] = useState<number | null>(null)
  const from = useRef(target)
  const frame = useRef(0)
  const mountedAt = useRef(0)
  useEffect(() => {
    if (!mountedAt.current) mountedAt.current = performance.now()
    cancelAnimationFrame(frame.current)
    const start = from.current
    // Not from 0 / right after mount: that's data arriving on page load, not a change worth showing.
    const settling = start === 0 || performance.now() - mountedAt.current < 700
    if (!enabled || start === target || settling || reducedMotion()) {
      from.current = target
      setShown(null)
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DUR.count)
      const v = Math.round(start + (target - start) * easeOutCubic(t))
      from.current = v
      setShown(t < 1 ? v : null)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, enabled])
  // null = at rest: show the real value (no extra renders for amounts that never animate).
  return shown ?? target
}

/** Keeps the last non-null value, so a dialog's content stays put while it animates closed. */
export function useLastDefined<T>(value: T | null | undefined): T | null {
  const [last, setLast] = useState<T | null>(value ?? null)
  if (value != null && value !== last) setLast(value)
  return value ?? last
}

type Box = { top: number; left: number; width: number; height: number }

/**
 * List motion without a library (FLIP + Web Animations): items marked `data-flip-key` inside the container
 * fade/slide in when added, siblings glide into place when the list changes, and removed items fade out
 * as a ghost over the gap that is closing. Transform/opacity only. Big swaps (month change, heavy filtering)
 * and the first moments after mount (data loading) are not animated.
 */
export function useListMotion<T extends HTMLElement>(resetKey?: unknown): RefObject<T | null> {
  const ref = useRef<T>(null)
  const prev = useRef<{ boxes: Map<string, Box>; nodes: Map<string, HTMLElement>; reset: unknown } | null>(null)
  const mountedAt = useRef(0)
  const pendingReset = useRef(false)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    if (!mountedAt.current) mountedAt.current = performance.now()
    const base = root.getBoundingClientRect()
    const nodes = new Map<string, HTMLElement>()
    const boxes = new Map<string, Box>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip-key]')) {
      const k = el.dataset.flipKey!
      const r = el.getBoundingClientRect()
      nodes.set(k, el)
      boxes.set(k, { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height })
    }
    const last = prev.current
    prev.current = { boxes, nodes, reset: resetKey }
    if (!last) return
    // A new context (e.g. another month): the next change of items is a swap, not edits.
    if (last.reset !== resetKey) pendingReset.current = true
    if (reducedMotion() || performance.now() - mountedAt.current < 900) return
    // Not displayed (e.g. the desktop table at phone width): nothing to animate.
    if (!root.getClientRects().length) return

    const added = [...nodes.keys()].filter((k) => !last.boxes.has(k))
    const removed = [...last.boxes.keys()].filter((k) => !boxes.has(k))
    if (!added.length && !removed.length) {
      // Same items: only glide ones that moved (e.g. a re-sort by a changed amount).
      if (![...boxes].some(([k, b]) => Math.abs(b.top - last.boxes.get(k)!.top) > 1)) return
    }
    if (pendingReset.current || added.length > 12 || removed.length > 12) {
      // Big swap: one soft fade of the whole list instead of dozens of row animations.
      pendingReset.current = false
      root.animate([{ opacity: 0.25, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.slow, easing: EASE.out })
      return
    }

    const vh = window.innerHeight
    const onScreen = (b: Box) => b.top + base.top < vh + 40 && b.top + b.height + base.top > -40
    for (const [k, el] of nodes) {
      const b = boxes.get(k)!
      const was = last.boxes.get(k)
      if (!was) {
        if (!onScreen(b)) continue
        el.animate(
          [
            { opacity: 0, transform: 'translateY(-6px) scale(0.99)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: DUR.slow, easing: EASE.out, delay: 40 },
        )
        el.classList.remove('row-flash')
        void el.offsetWidth
        el.classList.add('row-flash')
        continue
      }
      const dy = was.top - b.top
      if (Math.abs(dy) < 1 || (!onScreen(b) && !onScreen(was))) continue
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: DUR.slow, easing: EASE.out })
    }
    // Removed items: put the detached node back as a ghost where it was, and fade it away.
    const pos = getComputedStyle(root).position
    if (pos === 'static') root.style.position = 'relative'
    for (const k of removed) {
      const node = last.nodes.get(k)
      const b = last.boxes.get(k)!
      if (!node || node.isConnected || !onScreen(b)) continue
      let ghost: HTMLElement = node
      if (node.tagName === 'TR') {
        // A row needs its table (and column widths) to lay out.
        const table = document.createElement('table')
        const cols = root.querySelector('colgroup')
        table.className = (root.querySelector('table')?.className ?? '') + ' pointer-events-none'
        if (cols) table.append(cols.cloneNode(true))
        const body = document.createElement('tbody')
        body.append(node)
        table.append(body)
        ghost = table
      }
      Object.assign(ghost.style, { position: 'absolute', top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px`, margin: '0', pointerEvents: 'none', zIndex: '0' })
      ghost.setAttribute('aria-hidden', 'true')
      ghost.setAttribute('inert', '')
      root.append(ghost)
      ghost
        .animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'scale(0.98)' },
          ],
          { duration: DUR.base, easing: EASE.in, fill: 'forwards' },
        )
        .finished.then(() => ghost.remove(), () => ghost.remove())
    }
  })

  return ref
}
