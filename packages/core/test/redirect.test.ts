import { describe, it, expect } from 'vitest'
import { safeNextPath } from '../src/redirect'

describe('safeNextPath', () => {
  it.each([
    ['/activity', '/activity'],
    ['/plan?tab=loans', '/plan?tab=loans'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/'],
    [null, '/'],
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com'],
  ])('%s → %s', (input, want) => expect(safeNextPath(input)).toBe(want))
})
