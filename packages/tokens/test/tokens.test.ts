import { describe, it, expect } from 'vitest'
import { tokens, cssVariables, categoryTint } from '../src'

describe('tokens', () => {
  it('themes share identical keys', () =>
    expect(Object.keys(tokens.color.dark).sort()).toEqual(Object.keys(tokens.color.light).sort()))
  it('brand is ink (equals text) in both themes', () => {
    expect(tokens.color.light.brand).toBe(tokens.color.light.text)
    expect(tokens.color.dark.brand).toBe(tokens.color.dark.text)
  })
  it('spec base colors', () => {
    expect(tokens.color.light.page).toBe('#F5F5F3')
    expect(tokens.color.dark.page).toBe('#0C0C0D')
    expect(tokens.color.light.positive).toBe('#15803D')
    expect(tokens.color.dark.positive).toBe('#4ADE80')
  })
  it('css variables are kebab-cased', () => {
    const v = cssVariables('light')
    expect(v['--page']).toBe('#F5F5F3')
    expect(v['--surface-muted']).toBe(tokens.color.light.surfaceMuted)
    expect(v['--brand-fg']).toBe(tokens.color.light.brandFg)
  })
  it('radii match spec', () =>
    expect(tokens.radius).toMatchObject({ card: 18, hero: 24, sheet: 26, tile: 11, pill: 999 }))
  it('category tints differ per theme and fall back', () => {
    expect(categoryTint('amber', 'light')).not.toBe(categoryTint('amber', 'dark'))
    expect(categoryTint('nope' as never, 'light')).toBe(categoryTint('slate', 'light'))
  })
})

// WCAG 2.x contrast ratio (spec §7.5: text meets AA, 4.5:1).
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x! + 0.05) / (y! + 0.05)
}

describe('contrast (AA for text)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const c = tokens.color[theme]
    for (const fg of ['text', 'textMuted', 'textFaint', 'danger', 'positive', 'warning'] as const) {
      for (const bg of ['page', 'surface'] as const) {
        it(`${theme}: ${fg} on ${bg} ≥ 4.5`, () => expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5))
      }
    }
  }
})
