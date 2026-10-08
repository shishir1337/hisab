import { useEffect, useRef, useState } from 'react'
import { duration, useMotion } from './motion'

/** Ease-out cubic: fast start, gentle landing (matches `curve.out` closely enough for numbers). */
export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

/**
 * Value shown `t` ms into a count from `from` to `to`. Intermediate values are whole currency units (no
 * flickering decimals); the last frame is exact.
 */
export function countFrame(from: number, to: number, t: number, ms: number = duration.count): number {
  if (t >= ms || from === to) return to
  const v = from + (to - from) * easeOutCubic(Math.max(0, t) / ms)
  return Math.round(v / 100) * 100
}

/**
 * A number that counts to its new value (~400 ms) when it changes. The first real value and every value while
 * `skip` (e.g. amounts hidden) or reduced motion is on appear instantly. Re-renders only the caller, at most
 * once a frame for the duration.
 */
export function useCountUp(target: number, skip = false): number {
  const { reduced } = useMotion()
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  const settled = useRef(false)

  useEffect(() => {
    // The first value after mount is usually the data arriving, not a change worth animating.
    if (!settled.current || skip || reduced || current.current === target) {
      settled.current = settled.current || target !== 0
      current.current = target
      setShown(target)
      return
    }
    const from = current.current
    const start = Date.now()
    let raf = 0
    const tick = () => {
      const v = countFrame(from, target, Date.now() - start)
      current.current = v
      setShown(v)
      if (v !== target || Date.now() - start < duration.count) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, skip, reduced])

  return shown
}
