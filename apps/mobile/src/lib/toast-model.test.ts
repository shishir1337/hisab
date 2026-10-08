import { describe, expect, it } from 'vitest'
import { inferKind, pushToast, runUndos, TOAST_MS, TOAST_UNDO_MS, toastLabel } from './toast-model'

describe('inferKind', () => {
  it('undo when it can be undone', () => expect(inferKind({ message: 'Deleted', onUndo: () => {} })).toBe('undo'))
  it('error for “Couldn’t …” (curly and straight)', () => {
    expect(inferKind({ message: 'Couldn’t save. Please try again.' })).toBe('error')
    expect(inferKind({ message: "Couldn't undo" })).toBe('error')
  })
  it('info otherwise', () => expect(inferKind({ message: 'Already recorded' })).toBe('info'))
  it('explicit kind wins', () => expect(inferKind({ message: 'Couldn’t', kind: 'success', onUndo: () => {} })).toBe('success'))
})

describe('pushToast', () => {
  it('new toast', () => {
    const t = pushToast(null, { message: 'Hi' }, 1)
    expect(t).toMatchObject({ id: 1, version: 1, count: 1, kind: 'info', duration: TOAST_MS, haptic: true })
  })
  it('undo toasts last longer', () => expect(pushToast(null, { message: 'Deleted', onUndo: () => {} }, 1).duration).toBe(TOAST_UNDO_MS))
  it('identical message coalesces and keeps every undo, newest first', () => {
    const a = () => {}
    const b = () => {}
    const first = pushToast(null, { message: 'Saved', onUndo: a }, 1)
    const second = pushToast(first, { message: 'Saved', onUndo: b }, 2)
    expect(second).toMatchObject({ id: 1, version: 2, count: 2 })
    expect(second.undos).toEqual([b, a])
    expect(toastLabel(second)).toBe('Saved ×2')
  })
  it('a different message replaces', () => {
    const first = pushToast(null, { message: 'Saved', onUndo: () => {} }, 1)
    const next = pushToast(first, { message: 'Deleted', onUndo: () => {} }, 2)
    expect(next).toMatchObject({ id: 2, count: 1, message: 'Deleted' })
    expect(next.undos).toHaveLength(1)
  })
  it('same text but different kind does not coalesce', () => {
    const first = pushToast(null, { message: 'Done' }, 1)
    expect(pushToast(first, { message: 'Done', onUndo: () => {} }, 2).id).toBe(2)
  })
  it('haptic false is respected', () => expect(pushToast(null, { message: 'x', haptic: false }, 1).haptic).toBe(false))
})

describe('runUndos', () => {
  it('runs all in order and reports the first failure', async () => {
    const calls: number[] = []
    await expect(
      runUndos([
        () => void calls.push(1),
        () => {
          calls.push(2)
          throw new Error('nope')
        },
        async () => void calls.push(3),
      ]),
    ).rejects.toThrow('nope')
    expect(calls).toEqual([1, 2, 3])
  })
})
