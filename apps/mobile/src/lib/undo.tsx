import { Check, CircleAlert, Info, Undo2 } from 'lucide-react-native'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Press } from '@/components/press'
import { duration, easing, haptic, spring, timing, useMotion } from './motion'
import { useTheme } from './theme'
import { pushToast, runUndos, toastLabel, type ToastInput, type ToastKind, type ToastState } from './toast-model'

export type { ToastInput, ToastKind } from './toast-model'

const ToastContext = createContext<(t: ToastInput) => void>(() => {})
const HostContext = createContext<{ current: ToastState | null; clear: (id: number) => void; show: (t: ToastInput) => void }>({
  current: null,
  clear: () => {},
  show: () => {},
})
/** The app-lock overlay is up: toasts wait underneath it and never show over the lock screen. */
export const ToastBlockContext = createContext(false)

/**
 * `toast({ message, onUndo?, kind? })` — a pill that drops in under the status bar. With `onUndo` it offers
 * Undo for 5 s (spec §7.3, no confirm dialogs). Identical repeats coalesce ("Saved ×2").
 */
export const useToast = () => use(ToastContext)

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null)
  const nextId = useRef(1)
  const show = useCallback((t: ToastInput) => setCurrent((cur) => pushToast(cur, t, nextId.current++)), [])
  const clear = useCallback((id: number) => setCurrent((cur) => (cur?.id === id ? null : cur)), [])
  const host = useMemo(() => ({ current, clear, show }), [current, clear, show])
  return (
    <ToastContext value={show}>
      <HostContext value={host}>{children}</HostContext>
    </ToastContext>
  )
}

const HAPTIC: Record<ToastKind, () => void> = { success: haptic.success, undo: haptic.success, error: haptic.error, info: haptic.selection }
const OFFSCREEN = -160

/**
 * Renders the current toast. Mount it after the bottom-sheet provider (so it sits above sheets) and inside
 * the app lock (so the lock overlay covers it).
 */
export function ToastHost() {
  const { current, clear, show } = use(HostContext)
  const blocked = use(ToastBlockContext)
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()
  const { reduced } = useMotion()
  // What is on screen; it outlives `current` while the pill animates away.
  const [shown, setShown] = useState<ToastState | null>(null)
  const y = useSharedValue(OFFSCREEN)
  const fade = useSharedValue(0)
  const drag = useSharedValue(0)
  const scale = useSharedValue(1)
  const progress = useSharedValue(1)
  const leaving = useSharedValue(false)
  const shownRef = useRef<ShownRef>({ id: 0, version: 0 })

  const finish = useCallback(
    (id: number) => {
      if (shownRef.current.id === id) shownRef.current = { id: 0, version: 0 }
      setShown((s) => (s?.id === id ? null : s))
      clear(id)
    },
    [clear],
  )

  const dismiss = useCallback(
    (velocity = 0) => {
      const id = shownRef.current.id
      if (!id || leaving.value) return
      leaving.value = true
      cancelAnimation(progress)
      const done = (finished?: boolean) => {
        'worklet'
        if (finished) scheduleOnRN(finish, id)
      }
      if (reduced) {
        fade.value = withTiming(0, timing(duration.fast), done)
        return
      }
      fade.value = withTiming(0, timing(duration.base, 'in'))
      y.value = withTiming(OFFSCREEN, { duration: velocity < -800 ? duration.fast : duration.base, easing: easing.in }, done)
    },
    [finish, fade, y, progress, leaving, reduced],
  )

  const startTimer = useCallback(
    (ms: number) => {
      progress.value = withTiming(0, { duration: ms, easing: Easing.linear }, (finished) => {
        'worklet'
        if (finished) scheduleOnRN(dismiss, 0)
      })
    },
    [progress, dismiss],
  )

  // React to a new / coalesced / cleared toast.
  useEffect(() => {
    if (!current) {
      if (shownRef.current.id) dismiss()
      return
    }
    if (current.id === shownRef.current.id && current.version === shownRef.current.version) return
    const fresh = !shownRef.current.id || leaving.value
    const sameToast = current.id === shownRef.current.id
    shownRef.current = { id: current.id, version: current.version }
    setShown(current)
    leaving.value = false
    drag.value = 0
    if (fresh) {
      y.value = reduced ? 0 : OFFSCREEN
      fade.value = 0
      y.value = withSpring(0, spring.snappy)
      fade.value = withTiming(1, timing(reduced ? duration.fast : duration.base))
    } else if (!reduced) {
      // Replaced or coalesced: a small nudge says "this is new" without a second entrance.
      scale.value = withSequence(withTiming(sameToast ? 1.04 : 1.02, { duration: duration.press, easing: easing.out }), withSpring(1, spring.snappy))
    }
    cancelAnimation(progress)
    progress.value = 1
    startTimer(current.duration)
    if (current.haptic && !blocked) HAPTIC[current.kind]()
    AccessibilityInfo.announceForAccessibility(toastLabel(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const resume = useCallback(() => {
    const id = shownRef.current.id
    if (!id || leaving.value) return
    const toast = shown
    startTimer(Math.max(800, progress.value * (toast?.duration ?? duration.toast)))
  }, [shown, startTimer, progress, leaving])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
          cancelAnimation(progress)
        })
        .onUpdate((e) => {
          // Up follows the finger; down gives a little and resists.
          drag.value = e.translationY < 0 ? e.translationY : 14 * Math.log1p(e.translationY / 14)
        })
        .onEnd((e) => {
          if (e.translationY < -24 || e.velocityY < -500) {
            drag.value = withTiming(Math.min(e.translationY, 0) - 40, { duration: duration.fast, easing: easing.out })
            scheduleOnRN(dismiss, e.velocityY)
          } else {
            drag.value = withSpring(0, spring.snappy)
            scheduleOnRN(resume)
          }
        }),
    [drag, progress, dismiss, resume],
  )

  const pillStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: y.value + drag.value }, { scale: scale.value }],
  }))
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }))

  if (!shown || blocked) return null

  const fg = colors.page
  const dark = scheme === 'dark'
  const iconColor =
    shown.kind === 'success' || shown.kind === 'undo'
      ? dark
        ? '#15803D'
        : '#4ADE80'
      : shown.kind === 'error'
        ? dark
          ? '#C2410C'
          : '#FB923C'
        : fg
  const Icon = shown.kind === 'undo' ? Undo2 : shown.kind === 'error' ? CircleAlert : shown.kind === 'info' ? Info : Check
  const undoable = shown.undos.length > 0

  const onUndo = async () => {
    const undos = shown.undos
    haptic.light()
    dismiss()
    try {
      await runUndos(undos)
    } catch {
      show({ message: 'Couldn’t undo. Please fix it manually.', kind: 'error' })
    }
  }

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 2000 }]}>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 14, right: 14, alignItems: 'center' }}>
        <GestureDetector gesture={pan}>
          <Animated.View
            layout={reduced ? undefined : LinearTransition.duration(duration.base).easing(easing.out)}
            accessibilityRole="alert"
            accessibilityHint="Swipe up to dismiss"
            style={[
              {
                maxWidth: '100%',
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 24,
                paddingLeft: 8,
                paddingRight: undoable ? 4 : 18,
                backgroundColor: colors.text,
                shadowColor: '#000',
                shadowOpacity: dark ? 0.5 : 0.22,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              },
              pillStyle,
            ]}
          >
            <Animated.View key={shown.id} entering={FadeIn.duration(duration.fast)} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)',
                }}
              >
                <Icon size={16} color={iconColor} strokeWidth={2.4} />
              </View>
              <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 10, color: fg, fontSize: 14, fontWeight: '500', letterSpacing: -0.1 }}>
                {shown.message}
                {shown.count > 1 ? <Text style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{`  ×${shown.count}`}</Text> : null}
              </Text>
            </Animated.View>
            {undoable && (
              <Press
                accessibilityRole="button"
                accessibilityLabel={shown.count > 1 ? `Undo all ${shown.count}` : 'Undo'}
                feedback="opacity"
                hitSlop={6}
                onPress={() => void onUndo()}
                style={{ marginLeft: 12, height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' }}
              >
                <Text style={{ color: fg, fontSize: 14, fontWeight: '700' }}>Undo</Text>
                <View style={{ position: 'absolute', left: 14, right: 14, bottom: 7, height: 2, borderRadius: 1, overflow: 'hidden', backgroundColor: dark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.16)' }}>
                  <Animated.View style={[{ flex: 1, backgroundColor: fg, opacity: 0.7, transformOrigin: 'left' }, barStyle]} />
                </View>
              </Press>
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  )
}

type ShownRef = { id: number; version: number }
