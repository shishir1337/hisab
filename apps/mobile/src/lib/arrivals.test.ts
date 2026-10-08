import { describe, expect, it } from 'vitest'
import { arrivals } from './arrivals'

describe('arrivals', () => {
  it('nothing on first render', () => expect(arrivals(null, ['a', 'b']).size).toBe(0))
  it('the new id', () => expect([...arrivals(new Set(['a']), ['b', 'a'])]).toEqual(['b']))
  it('nothing for removals', () => expect(arrivals(new Set(['a', 'b']), ['a']).size).toBe(0))
  it('bulk arrivals do not animate', () => expect(arrivals(new Set(['a']), ['a', 'b', 'c', 'd', 'e']).size).toBe(0))
  it('max is configurable', () => expect(arrivals(new Set(['z']), ['a', 'b'], 1).size).toBe(0))
  it('nothing when the baseline was empty (first load)', () => expect(arrivals(new Set(), ['a']).size).toBe(0))
})
