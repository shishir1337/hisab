/** Pure first-run logic (no React Native imports, so it's unit-testable). */

/** Device-local: the pre-sign-in walkthrough was finished or skipped. */
export const WELCOME_KEY = 'hisab.welcomeSeen'
/** Device-local: the app has launched before (later launches get the short intro). */
export const LAUNCHED_KEY = 'hisab.launched'

export const isSet = (raw: string | null | undefined): boolean => raw === '1'

export interface FirstRunFlags {
  welcomeSeen: boolean
  firstLaunch: boolean
}

/** Reads both flags from an AsyncStorage `multiGet` result. Unknown or missing values count as "not seen". */
export function parseFirstRun(entries: readonly (readonly [string, string | null])[]): FirstRunFlags {
  const get = (k: string) => entries.find(([key]) => key === k)?.[1] ?? null
  return { welcomeSeen: isSet(get(WELCOME_KEY)), firstLaunch: !isSet(get(LAUNCHED_KEY)) }
}

/** Signed-out users who haven't seen it get the walkthrough; signed-in users never do. */
export const showWelcome = (signedIn: boolean, welcomeSeen: boolean): boolean => !signedIn && !welcomeSeen

export type IntroKind = 'full' | 'short' | 'fade'

export interface IntroPlan {
  kind: IntroKind
  /** Wordmark slides out beside the tile (first launch only). */
  wordmark: boolean
  /** The earliest the overlay may start leaving, even if the app is ready sooner. */
  minMs: number
  /** How long the overlay takes to leave. */
  exitMs: number
}

/**
 * Launch intro timing. First launch: the full ~900 ms brand moment. Later launches: a ~400 ms sheen and
 * out. Reduced motion: hold the still frame until the app is ready, then a quick fade.
 */
export function introPlan(firstLaunch: boolean, reduced: boolean): IntroPlan {
  if (reduced) return { kind: 'fade', wordmark: false, minMs: 0, exitMs: 160 }
  if (firstLaunch) return { kind: 'full', wordmark: true, minMs: 640, exitMs: 280 }
  return { kind: 'short', wordmark: false, minMs: 200, exitMs: 220 }
}

/** When the exit starts: after the minimum, or as soon as the app is ready if that's later. */
export const exitAt = (plan: IntroPlan, readyAtMs: number): number => Math.max(plan.minMs, readyAtMs)
