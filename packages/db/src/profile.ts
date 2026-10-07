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

/**
 * Saves profile fields. Before the first sync the row may not exist locally: it is created with the
 * server's id (= user id) and only the patched columns, so the upload (see the connector) changes just
 * those columns on the server row instead of resetting the rest to defaults. Readers fall back to
 * defaults for the empty columns until the server row syncs down.
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
      const row = { ...values, id: userId, user_id: userId, updated_at: ts }
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

const ISSUE_LABEL: Record<string, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  categories: 'Category',
  parties: 'Person / company',
  loans: 'Loan',
  lendings: 'Lending',
  recurring_rules: 'Recurring item',
  recurring_skips: 'Skipped recurring item',
  budgets: 'Budget',
  profiles: 'Settings',
}
const ISSUE_VERB: Record<string, string> = { PUT: 'New', PATCH: 'Edited', DELETE: 'Deleted' }

/**
 * Plain-language summary of a refused change, so the user knows what to re-enter, e.g.
 * "New transaction · Lunch · 2026-10-08". The server's message is kept separately for support.
 */
export function describeIssue(issue: Pick<UploadIssue, 'table_name' | 'op' | 'payload'>): string {
  const label = ISSUE_LABEL[issue.table_name] ?? issue.table_name
  const verb = ISSUE_VERB[issue.op]
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(issue.payload) as Record<string, unknown>
  } catch {
    // keep the label only
  }
  const name = [data.name, data.note].find((v): v is string => typeof v === 'string' && v.trim() !== '')
  const day = [data.occurred_on, data.started_on, data.starts_on].find((v): v is string => typeof v === 'string')
  return [verb ? `${verb} ${label.toLowerCase()}` : label, name?.trim(), day].filter(Boolean).join(' · ')
}

/** Removes the parked record only — never user data. */
export async function discardIssue(ex: Executor, id: string): Promise<void> {
  await ex.execute('delete from upload_issues where id = ?', [id])
}

export async function clearIssues(ex: Executor): Promise<void> {
  await ex.execute('delete from upload_issues')
}
