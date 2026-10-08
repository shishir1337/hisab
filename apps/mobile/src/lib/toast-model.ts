/** Pure toast logic (no React Native imports, unit-tested). */

export type ToastKind = 'success' | 'undo' | 'error' | 'info'

export interface ToastInput {
  message: string
  onUndo?: () => void | Promise<void>
  /** Inferred when omitted: onUndo → 'undo', "Couldn’t …" → 'error', otherwise 'info'. */
  kind?: ToastKind
  /** Set false when the caller already gave haptic feedback for this action. */
  haptic?: boolean
}

export interface ToastState {
  id: number
  /** Bumps on every show, coalesced or not, so timers restart. */
  version: number
  message: string
  kind: ToastKind
  count: number
  haptic: boolean
  /** All undo actions this toast stands for (a coalesced "Saved ×2" undoes both, newest first). */
  undos: (() => void | Promise<void>)[]
  duration: number
}

export const TOAST_MS = 3500
export const TOAST_UNDO_MS = 5000

export function inferKind(t: Pick<ToastInput, 'message' | 'onUndo' | 'kind'>): ToastKind {
  if (t.kind) return t.kind
  if (t.onUndo) return 'undo'
  if (/^(couldn[’']t|can[’']t|failed|error)\b/i.test(t.message.trim())) return 'error'
  return 'info'
}

/**
 * Next toast state. An identical message (same kind) while the toast is still showing coalesces into it
 * ("Saved ×2") instead of replacing it; anything else replaces it.
 */
export function pushToast(current: ToastState | null, input: ToastInput, nextId: number): ToastState {
  const kind = inferKind(input)
  const haptic = input.haptic !== false
  if (current && current.message === input.message && current.kind === kind) {
    const undos = input.onUndo ? [input.onUndo, ...current.undos] : current.undos
    return { ...current, version: current.version + 1, count: current.count + 1, haptic, undos, duration: undos.length ? TOAST_UNDO_MS : TOAST_MS }
  }
  const undos = input.onUndo ? [input.onUndo] : []
  return { id: nextId, version: 1, message: input.message, kind, count: 1, haptic, undos, duration: undos.length ? TOAST_UNDO_MS : TOAST_MS }
}

/** "Saved · Tea ×2" */
export function toastLabel(t: Pick<ToastState, 'message' | 'count'>): string {
  return t.count > 1 ? `${t.message} ×${t.count}` : t.message
}

/** Runs every undo newest first; rejects if any fails (after trying them all). */
export async function runUndos(undos: ToastState['undos']): Promise<void> {
  let failed: unknown = null
  for (const u of undos) {
    try {
      await u()
    } catch (e) {
      failed ??= e
    }
  }
  if (failed) throw failed
}
