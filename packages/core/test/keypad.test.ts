import { describe, it, expect } from 'vitest'
import { keypadReducer, keypadToMinor, keypadFromMinor, type KeypadKey } from '../src/keypad'

const type = (...keys: KeypadKey[]) => keys.reduce(keypadReducer, '')

describe('keypadReducer', () => {
  it('types digits', () => expect(type('1', '4', '5', '0')).toBe('1450'))
  it('leading zero collapses', () => expect(type('0', '0', '5')).toBe('5'))
  it('single zero allowed', () => expect(type('0')).toBe('0'))
  it('leading dot becomes 0.', () => expect(type('.')).toBe('0.'))
  it('only one dot', () => expect(type('1', '.', '.', '5')).toBe('1.5'))
  it('max two decimals', () => expect(type('1', '.', '2', '5', '9')).toBe('1.25'))
  it('zero then dot keeps the zero', () => expect(type('0', '.', '5')).toBe('0.5'))
  it('max 10 integer digits', () => expect(type(...('12345678901'.split('') as KeypadKey[]))).toBe('1234567890'))
  it('backspace', () => expect(type('1', '2', 'back')).toBe('12'.slice(0, 1)))
  it('backspace past start is empty', () => expect(type('1', 'back', 'back')).toBe(''))
  it('clear', () => expect(type('9', '9', 'clear')).toBe(''))
})

describe('keypadToMinor', () => {
  it.each([
    ['', null],
    ['0', null],
    ['0.', null],
    ['12', 1200],
    ['12.5', 1250],
    ['12.05', 1205],
    ['0.01', 1],
  ])('%s → %s', (s, want) => expect(keypadToMinor(s)).toBe(want))
})

describe('keypadFromMinor', () => {
  it.each([
    [145000, '1450'],
    [145050, '1450.5'],
    [1205, '12.05'],
    [1, '0.01'],
  ])('%d → %s', (m, want) => expect(keypadFromMinor(m)).toBe(want))
})
