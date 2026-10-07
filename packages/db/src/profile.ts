import { z } from 'zod'
import { atomic, type Executor } from './executor'
import { ValidationError } from './mutations'

/** Editable profile fields (spec §5.2 profiles). Mirrors the Postgres CHECKs. */
export const profilePatch = z
  .object({
    display_name: z.string().trim().max(80).nullable(),
    base_currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. BDT'),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz })
        return true
      } catch {
        return false
      }
    }, 'Unknown time zone'),
    number_grouping: z.enum(['south_asian', 'western']),
    nudge_enabled: z.boolean(),
    nudge_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
    lending_reminder_interval_days: z.number().int().min(1).max(60),
    theme: z.enum(['system', 'light', 'dark']),
    app_lock_enabled: z.boolean(),
    hide_amounts: z.boolean(),
    onboarded_at: z.string().nullable(),
  })
  .partial()
export type ProfilePatch = z.input<typeof profilePatch>

const DEFAULTS = {
  base_currency: 'BDT',
  timezone: 'Asia/Dhaka',
  number_grouping: 'south_asian',
  nudge_enabled: 1,
  nudge_time: '21:00',
  lending_reminder_interval_days: 3,
  theme: 'system',
  app_lock_enabled: 0,
  hide_amounts: 0,
}

/**
 * Saves profile fields. Before the first sync the row may not exist locally: it is created with the
 * server's id (= user id), so the later upload updates the server row instead of duplicating it.
 */
export async function saveProfile(ex: Executor, userId: string, patch: ProfilePatch): Promise<void> {
  const r = profilePatch.safeParse(patch)
  if (!r.success) throw new ValidationError(r.error.issues)
  const values = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : v]))
  const ts = new Date().toISOString()
  await atomic(ex, async (tx) => {
    const existing = await tx.getOptional<{ id: string }>('select id from profiles where id = ?', [userId])
    if (existing) {
      const cols = Object.keys(values)
      if (cols.length === 0) return
      await tx.execute(`update profiles set ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? where id = ?`, [...cols.map((c) => values[c]), ts, userId])
    } else {
      const row = { ...DEFAULTS, ...values, id: userId, user_id: userId, created_at: ts, updated_at: ts }
      const cols = Object.keys(row)
      await tx.execute(`insert into profiles (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c as keyof typeof row]))
    }
  })
}

// ---------------------------------------------------------------- upload issues (spec §9)

export interface UploadIssue {
  id: string
  table_name: string
  row_id: string
  op: string
  code: string
  message: string
  payload: string
  created_at: string
}

/** Removes the parked record only — never user data. */
export async function discardIssue(ex: Executor, id: string): Promise<void> {
  await ex.execute('delete from upload_issues where id = ?', [id])
}

export async function clearIssues(ex: Executor): Promise<void> {
  await ex.execute('delete from upload_issues')
}
