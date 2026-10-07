import { md5Uuid } from '@hisab/core'
import type { Executor } from './executor'

/**
 * Default categories. MUST stay identical to `public.seed_default_categories` in
 * supabase/migrations (names, kinds, icons, colors, order) — both sides derive the same ids.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Food', kind: 'expense', icon: '🍛', color: 'amber', sort_order: 1 },
  { name: 'Groceries', kind: 'expense', icon: '🛒', color: 'green', sort_order: 2 },
  { name: 'Transport', kind: 'expense', icon: '🚕', color: 'blue', sort_order: 3 },
  { name: 'Bills & Utilities', kind: 'expense', icon: '💡', color: 'teal', sort_order: 4 },
  { name: 'Rent', kind: 'expense', icon: '🏠', color: 'violet', sort_order: 5 },
  { name: 'Health', kind: 'expense', icon: '💊', color: 'rose', sort_order: 6 },
  { name: 'Shopping', kind: 'expense', icon: '🛍️', color: 'orange', sort_order: 7 },
  { name: 'Family', kind: 'expense', icon: '👪', color: 'rose', sort_order: 8 },
  { name: 'Education', kind: 'expense', icon: '📚', color: 'blue', sort_order: 9 },
  { name: 'Fun', kind: 'expense', icon: '🎬', color: 'violet', sort_order: 10 },
  { name: 'Personal Care', kind: 'expense', icon: '🧴', color: 'teal', sort_order: 11 },
  { name: 'Gifts', kind: 'expense', icon: '🎁', color: 'orange', sort_order: 12 },
  { name: 'Other', kind: 'expense', icon: '•', color: 'slate', sort_order: 13 },
  { name: 'Salary', kind: 'income', icon: '💼', color: 'green', sort_order: 1 },
  { name: 'Project / Freelance', kind: 'income', icon: '🧑‍💻', color: 'blue', sort_order: 2 },
  { name: 'Bonus', kind: 'income', icon: '✨', color: 'amber', sort_order: 3 },
  { name: 'Refund', kind: 'income', icon: '↩️', color: 'teal', sort_order: 4 },
  { name: 'Other', kind: 'income', icon: '•', color: 'slate', sort_order: 5 },
] as const

/** Deterministic id = Postgres `md5(user_id || ':' || kind || ':' || name)::uuid`. */
export function defaultCategoryId(userId: string, kind: 'income' | 'expense', name: string): string {
  return md5Uuid(`${userId}:${kind}:${name}`)
}

const inFlight = new WeakMap<Executor, Promise<number>>()

/**
 * Seeds the default categories locally when none exist yet (first launch offline, or sync not set up).
 * Because ids match the server seed, uploading them later is a no-op upsert, never a duplicate.
 * Returns how many rows were inserted.
 */
export function ensureDefaultCategories(ex: Executor, userId: string): Promise<number> {
  // Concurrent callers (e.g. a remount) share one run instead of racing on the same ids.
  const running = inFlight.get(ex)
  if (running) return running.then(() => 0)
  const run = seed(ex, userId).finally(() => inFlight.delete(ex))
  inFlight.set(ex, run)
  return run
}

async function seed(ex: Executor, userId: string): Promise<number> {
  const existing = await ex.getOptional<{ n: number }>('select count(*) as n from categories')
  if ((existing?.n ?? 0) > 0) return 0
  const ts = new Date().toISOString()
  for (const c of DEFAULT_CATEGORIES) {
    await ex.execute(
      'insert into categories (id, user_id, name, kind, icon, color, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [defaultCategoryId(userId, c.kind, c.name), userId, c.name, c.kind, c.icon, c.color, c.sort_order, ts, ts],
    )
  }
  return DEFAULT_CATEGORIES.length
}
