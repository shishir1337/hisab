import { useEffect, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from 'react'
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { arrivals } from '@/lib/arrivals'
import { duration, easing, spring, useMotion } from '@/lib/motion'

/** Ids that just arrived in a list (see `arrivals`); resets when `scope` changes (month, filter, search). */
export function useArrivals(ids: readonly string[], scope: string): Set<string> {
  const prev = useRef<{ scope: string; ids: Set<string> } | null>(null)
  const fresh = useMemo(() => arrivals(prev.current && prev.current.scope === scope ? prev.current.ids : null, ids), [ids, scope])
  useEffect(() => {
    prev.current = { scope, ids: new Set(ids) }
  }, [ids, scope])
  return fresh
}

/**
 * Entering/exiting/layout animations for short, non-virtualised lists (Home Today, Plan, People): a new row
 * fades in, a removed one fades out and the rows around it glide into place. Undefined with reduced motion.
 * Pass `entering` only to rows in `useArrivals()` so loading, scrolling and switching views never animate.
 */
export function useListMotion() {
  const { reduced } = useMotion()
  return useMemo(
    () =>
      reduced
        ? { entering: undefined, exiting: undefined, layout: undefined }
        : {
            entering: FadeIn.duration(duration.base).easing(easing.out),
            exiting: FadeOut.duration(duration.fast).easing(easing.in),
            layout: LinearTransition.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass),
          },
    [reduced],
  )
}

export interface RowPresenceHandle {
  /** Animates the row's height to zero, then calls `then` (e.g. the delete). */
  collapse: (then: () => void) => void
  /** Brings a collapsed row back (e.g. the delete failed). */
  expand: () => void
}

/**
 * Height-animating wrapper for rows in virtualised lists, where layout animations can't move the neighbours:
 * a row that `appear`s grows from nothing, and `collapse()` folds a row away before it is deleted, so the
 * rows below follow smoothly instead of jumping.
 */
export function RowPresence({ appear, children, ref }: { appear?: boolean; children: ReactNode; ref?: Ref<RowPresenceHandle> }) {
  const { reduced } = useMotion()
  const grow = Boolean(appear) && !reduced
  // -1 = natural height ("auto"); otherwise an explicit, animating height.
  const h = useSharedValue(grow ? 0 : -1)
  const o = useSharedValue(grow ? 0 : 1)
  const natural = useRef(0)
  const grew = useRef(!grow)

  useImperativeHandle(ref, () => ({
    collapse: (then) => {
      if (reduced || !natural.current) return then()
      h.value = natural.current
      o.value = withTiming(0, { duration: duration.fast, easing: easing.out })
      h.value = withTiming(0, { duration: duration.base, easing: easing.inOut }, (done) => {
        'worklet'
        if (done) scheduleOnRN(then)
      })
    },
    expand: () => {
      o.value = withTiming(1, { duration: duration.base, easing: easing.out })
      h.value = withTiming(natural.current, { duration: duration.base, easing: easing.inOut }, (done) => {
        'worklet'
        if (done) h.value = -1
      })
    },
  }))

  const style = useAnimatedStyle(() => (h.value < 0 ? { height: 'auto', opacity: o.value } : { height: h.value, opacity: o.value, overflow: 'hidden' }))

  return (
    <Animated.View style={style}>
      <Animated.View
        onLayout={(e) => {
          natural.current = e.nativeEvent.layout.height
          if (!grew.current) {
            grew.current = true
            o.value = withTiming(1, { duration: duration.base, easing: easing.out })
            h.value = withTiming(natural.current, { duration: duration.base, easing: easing.out }, (done) => {
              'worklet'
              if (done) h.value = -1
            })
          }
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  )
}
