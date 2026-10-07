import { describe, it, expect } from 'vitest'
import { rankSuggestions, rankCategories, type SuggestionRow } from '../src/suggest'

const TZ = 'Asia/Dhaka'
// "now" = 2026-10-07 16:00 in Dhaka (10:00Z)
const NOW = new Date('2026-10-07T10:00:00Z')
const at = (day: string, hourLocal: number) =>
  new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hourLocal - 6)).toISOString()

const row = (o: Partial<SuggestionRow>): SuggestionRow => ({
  category_id: 'tea',
  amount_minor: 3000,
  note: null,
  occurred_at: at('2026-10-06', 16),
  ...o,
})

describe('rankSuggestions', () => {
  it('merges identical (category, amount, note) and ranks by frequency', () => {
    const history = [
      row({}),
      row({ occurred_at: at('2026-10-05', 16) }),
      row({ category_id: 'lunch', amount_minor: 25000, occurred_at: at('2026-10-06', 16) }),
    ]
    const out = rankSuggestions(history, NOW, TZ)
    expect(out.map((s) => s.category_id)).toEqual(['tea', 'lunch'])
    expect(out[0]).toMatchObject({ amount_minor: 3000, count: 2 })
  })

  it('prefers entries usually logged near the current hour', () => {
    const history = [
      row({ category_id: 'breakfast', amount_minor: 8000, occurred_at: at('2026-10-06', 8) }),
      row({ category_id: 'breakfast', amount_minor: 8000, occurred_at: at('2026-10-05', 8) }),
      row({ category_id: 'tea', occurred_at: at('2026-10-06', 16) }),
      row({ category_id: 'tea', occurred_at: at('2026-10-05', 16) }),
    ]
    expect(rankSuggestions(history, NOW, TZ)[0]!.category_id).toBe('tea')
  })

  it('recent entries outweigh old ones', () => {
    const history = [
      row({ category_id: 'old', amount_minor: 100, occurred_at: at('2026-08-20', 16) }),
      row({ category_id: 'old', amount_minor: 100, occurred_at: at('2026-08-21', 16) }),
      row({ category_id: 'new', amount_minor: 200, occurred_at: at('2026-10-06', 16) }),
    ]
    expect(rankSuggestions(history, NOW, TZ)[0]!.category_id).toBe('new')
  })

  it('ignores entries older than 60 days', () => {
    expect(rankSuggestions([row({ occurred_at: at('2026-07-01', 16) })], NOW, TZ)).toEqual([])
  })

  it('returns at most 3', () => {
    const history = ['a', 'b', 'c', 'd'].map((c, i) => row({ category_id: c, amount_minor: 100 + i }))
    expect(rankSuggestions(history, NOW, TZ)).toHaveLength(3)
  })

  it('is deterministic on ties', () => {
    const history = [row({ category_id: 'b' }), row({ category_id: 'a' })]
    expect(rankSuggestions(history, NOW, TZ).map((s) => s.category_id)).toEqual(['a', 'b'])
  })
})

describe('rankCategories', () => {
  it('top categories by score then fills with the default order', () => {
    const history = [row({ category_id: 'food' }), row({ category_id: 'food', amount_minor: 1 }), row({ category_id: 'transport' })]
    const all = ['groceries', 'food', 'transport', 'health', 'rent'].map((id) => ({ id }))
    expect(rankCategories(history, NOW, TZ, all)).toEqual(['food', 'transport', 'groceries', 'health'])
  })
})
