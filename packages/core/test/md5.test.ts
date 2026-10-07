import { describe, it, expect } from 'vitest'
import { md5, md5Uuid } from '../src/md5'

describe('md5', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
    ['ব্যয়', '6189e1c67c1e8bfa144ef3338007f820'],
  ])('%s', (input, hex) => expect(md5(input)).toBe(hex))
})

describe('md5Uuid', () => {
  it('formats like Postgres md5(text)::uuid', () =>
    expect(md5Uuid('abc')).toBe('90015098-3cd2-4fb0-d696-3f7d28e17f72'))
})
