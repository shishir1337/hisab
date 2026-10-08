import { describe, expect, it, vi } from 'vitest'

// count-up imports motion (reanimated/haptics); only the pure helpers are tested here.
vi.mock('./motion', () => ({ duration: { count: 400 }, useMotion: () => ({ reduced: false }) }))
const { countFrame, easeOutCubic } = await import('./count-up')

describe('countFrame', () => {
  it('starts at from and ends exactly at to', () => {
    expect(countFrame(0, 12345, 0)).toBe(0)
    expect(countFrame(0, 12345, 400)).toBe(12345)
    expect(countFrame(0, 12345, 9999)).toBe(12345)
  })
  it('intermediate frames are whole units', () => {
    for (const t of [16, 100, 200, 333]) expect(countFrame(10050, 74385099, t) % 100).toBe(0)
  })
  it('moves monotonically toward the target, down as well as up', () => {
    const up = [0, 50, 150, 300].map((t) => countFrame(0, 100000, t))
    expect([...up].sort((a, b) => a - b)).toEqual(up)
    const down = [0, 50, 150, 300].map((t) => countFrame(100000, 0, t))
    expect([...down].sort((a, b) => b - a)).toEqual(down)
  })
  it('no change, no animation', () => expect(countFrame(500, 500, 10)).toBe(500))
})

describe('easeOutCubic', () => {
  it('is 0 → 1 and front-loaded', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})
