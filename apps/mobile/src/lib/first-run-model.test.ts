import { describe, expect, it } from 'vitest'
import { exitAt, introPlan, isSet, LAUNCHED_KEY, parseFirstRun, showWelcome, WELCOME_KEY } from './first-run-model'

describe('parseFirstRun', () => {
  it('fresh install: walkthrough not seen, first launch', () => {
    expect(parseFirstRun([[WELCOME_KEY, null], [LAUNCHED_KEY, null]])).toEqual({ welcomeSeen: false, firstLaunch: true })
  })
  it('returning device', () => {
    expect(parseFirstRun([[WELCOME_KEY, '1'], [LAUNCHED_KEY, '1']])).toEqual({ welcomeSeen: true, firstLaunch: false })
  })
  it('missing entries and junk values count as unset', () => {
    expect(parseFirstRun([])).toEqual({ welcomeSeen: false, firstLaunch: true })
    expect(parseFirstRun([[WELCOME_KEY, 'true']])).toEqual({ welcomeSeen: false, firstLaunch: true })
  })
  it('isSet only accepts "1"', () => {
    expect(isSet('1')).toBe(true)
    expect(isSet('0')).toBe(false)
    expect(isSet(undefined)).toBe(false)
  })
})

describe('showWelcome', () => {
  it('only for signed-out users who have not seen it', () => {
    expect(showWelcome(false, false)).toBe(true)
    expect(showWelcome(false, true)).toBe(false)
    expect(showWelcome(true, false)).toBe(false)
    expect(showWelcome(true, true)).toBe(false)
  })
})

describe('introPlan', () => {
  it('first launch: full intro with wordmark, ~900 ms in total', () => {
    const p = introPlan(true, false)
    expect(p).toMatchObject({ kind: 'full', wordmark: true })
    expect(p.minMs + p.exitMs).toBeGreaterThanOrEqual(850)
    expect(p.minMs + p.exitMs).toBeLessThanOrEqual(1000)
  })
  it('later launches: short, ~400 ms', () => {
    const p = introPlan(false, false)
    expect(p).toMatchObject({ kind: 'short', wordmark: false })
    expect(p.minMs + p.exitMs).toBeLessThanOrEqual(450)
  })
  it('reduced motion wins: quick fade, no minimum', () => {
    expect(introPlan(true, true)).toMatchObject({ kind: 'fade', wordmark: false, minMs: 0 })
  })
  it('exit waits for the app, never for longer than needed', () => {
    const p = introPlan(false, false)
    expect(exitAt(p, 0)).toBe(p.minMs)
    expect(exitAt(p, 1200)).toBe(1200)
  })
})
