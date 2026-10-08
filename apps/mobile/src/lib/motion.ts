import * as Haptics from 'expo-haptics'
import { Easing, ReduceMotion, useReducedMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'

/**
 * The one set of motion tokens (M7 §2). Web mirrors these exactly:
 *   durations in ms · easings as CSS cubic-bezier() · springs as damping/stiffness/mass.
 *
 * Principles: 150–250 ms; springs for movement, ease-out for fades; motion explains a change of state and
 * never decorates. With the OS "Remove animations" setting on, `useMotion()` reports `reduced` and callers
 * swap movement for an instant change or a short fade.
 */
export const duration = {
  /** Press-in, tiny state flips. */
  press: 90,
  fast: 150,
  base: 220,
  slow: 320,
  /** Number count-up (balance, totals). */
  count: 400,
  /** Toast visible time; with Undo it stays longer. */
  toast: 3500,
  toastUndo: 5000,
} as const

/** cubic-bezier control points, so web can use the same curves verbatim. */
export const curve = {
  /** Fades and things arriving: fast start, soft landing. */
  out: [0.22, 1, 0.36, 1],
  /** Things leaving. */
  in: [0.4, 0, 1, 1],
  /** Symmetric moves (progress bars, cross-fades). */
  inOut: [0.65, 0, 0.35, 1],
} as const

export const easing = {
  out: Easing.bezier(...curve.out),
  in: Easing.bezier(...curve.in),
  inOut: Easing.bezier(...curve.inOut),
  linear: Easing.linear,
}

/** Springs: `snappy` = tokens.motion.spring (default movement), `gentle` for large surfaces, `bouncy` for small confirmations. */
export const spring = {
  snappy: { damping: 22, stiffness: 260, mass: 1 },
  gentle: { damping: 26, stiffness: 180, mass: 1 },
  bouncy: { damping: 14, stiffness: 320, mass: 0.8 },
  /** Press release: settles fast without overshoot. */
  press: { damping: 30, stiffness: 520, mass: 0.7 },
} as const satisfies Record<string, WithSpringConfig>

/** Pressed-state targets (shared by every Press). */
export const pressTarget = {
  scale: 0.97,
  opacity: 0.6,
  soft: 0.85,
} as const

export const timing = (ms: number, ease: keyof typeof easing = 'out'): WithTimingConfig => ({
  duration: ms,
  easing: easing[ease],
  reduceMotion: ReduceMotion.System,
})

export const springCfg = (name: keyof typeof spring): WithSpringConfig => ({ ...spring[name], reduceMotion: ReduceMotion.System })

/** `reduced` is true when the OS asks for less motion (Android: "Remove animations"). */
export function useMotion() {
  const reduced = useReducedMotion()
  return { reduced }
}

/** Haptics map: light tap · selection · success · warning · error. */
export const haptic = {
  selection: () => void Haptics.selectionAsync().catch(() => {}),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
}
