import { localHour } from './dates'

/** Spec §6.7 — quick-log suggestions from the last 60 days of expenses. */

export interface SuggestionRow {
  category_id: string
  amount_minor: number
  note: string | null
  /** UTC ISO timestamp. */
  occurred_at: string
}

export interface Suggestion {
  category_id: string
  amount_minor: number
  note: string | null
  count: number
  score: number
}

const WINDOW_DAYS = 60
const HALF_LIFE_DAYS = 14
const HOUR_SIGMA = 2
const DAY_MS = 86_400_000

function hourDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 24 - d)
}

function scoreRows(history: SuggestionRow[], now: Date, timeZone: string, keyOf: (r: SuggestionRow) => string) {
  const nowHour = localHour(now, timeZone)
  const groups = new Map<string, { rows: SuggestionRow[]; score: number }>()
  for (const r of history) {
    const at = new Date(r.occurred_at)
    const ageDays = (now.getTime() - at.getTime()) / DAY_MS
    if (ageDays < 0 || ageDays > WINDOW_DAYS) continue
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    const dh = hourDistance(localHour(at, timeZone), nowHour)
    const hour = Math.exp(-(dh * dh) / (2 * HOUR_SIGMA * HOUR_SIGMA))
    // Each occurrence contributes; summing gives frequency × recency × hour proximity.
    const key = keyOf(r)
    const g = groups.get(key) ?? { rows: [], score: 0 }
    g.rows.push(r)
    g.score += recency * (0.25 + hour)
    groups.set(key, g)
  }
  return [...groups.entries()].sort(([ka, a], [kb, b]) => b.score - a.score || (ka < kb ? -1 : ka > kb ? 1 : 0))
}

export function rankSuggestions(history: SuggestionRow[], now: Date, timeZone: string, limit = 3): Suggestion[] {
  return scoreRows(history, now, timeZone, (r) => `${r.category_id}\u0000${r.amount_minor}\u0000${r.note ?? ''}`)
    .slice(0, limit)
    .map(([, g]) => ({
      category_id: g.rows[0]!.category_id,
      amount_minor: g.rows[0]!.amount_minor,
      note: g.rows[0]!.note,
      count: g.rows.length,
      score: g.score,
    }))
}

/** Top category ids for the chips: by usage score, then filled from `all` in its given order. */
export function rankCategories(
  history: SuggestionRow[],
  now: Date,
  timeZone: string,
  all: { id: string }[],
  limit = 4,
): string[] {
  const valid = new Set(all.map((c) => c.id))
  const ranked = scoreRows(history, now, timeZone, (r) => r.category_id)
    .map(([id]) => id)
    .filter((id) => valid.has(id))
  for (const c of all) if (!ranked.includes(c.id)) ranked.push(c.id)
  return ranked.slice(0, limit)
}
