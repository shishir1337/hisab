/**
 * Haptics through the Vibration API: Android Chrome (and installed Android PWAs) buzz; iOS Safari has no
 * Vibration API, so every call is a silent no-op there. Patterns mirror the Android app's haptic vocabulary.
 */
const PATTERNS = {
  /** Tab change, toggles, small taps. */
  selection: 6,
  /** Opening the quick log, a sheet snapping shut. */
  light: 10,
  /** Saved. */
  success: [10, 50, 14],
  /** Something didn't go through. */
  warning: [18, 60, 18],
} as const

export type HapticKind = keyof typeof PATTERNS

export function haptic(kind: HapticKind = 'light') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch {
    // Blocked before the first user gesture: fine.
  }
}
