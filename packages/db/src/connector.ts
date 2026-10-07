import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOLEAN_COLUMNS } from './schema'

/**
 * Postgres errors that will never succeed on retry: data exceptions (22), integrity violations (23),
 * insufficient privilege (42501) and our own raised exceptions (P0001). Anything else (network,
 * 5xx, PostgREST transport) is transient and must be retried by PowerSync.
 */
export function isPermanentError(code: string | undefined, message = ''): boolean {
  if (!code) return false
  // 42501 covers both a genuine RLS rejection and "permission denied for table" (request sent without a
  // user session, e.g. mid token refresh). Only the former can never succeed.
  if (code === '42501') return message === '' || /row-level security/i.test(message)
  return /^22...$/.test(code) || /^23...$/.test(code) || code === 'P0001'
}

/** Unique indexes that de-duplicate the same post from two devices: the row already exists server-side. */
const DEDUPE_INDEXES = ['tx_recurring_once', 'tx_installment_once', 'recurring_skips_once', 'budgets_one_per_category']
function isAlreadyPosted(error: { code?: string; message: string }): boolean {
  return error.code === '23505' && DEDUPE_INDEXES.some((i) => error.message.includes(i))
}

function toServerRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const bools = BOOLEAN_COLUMNS[table]
  if (!bools) return data
  const out = { ...data }
  for (const col of bools) if (col in out && out[col] !== null) out[col] = Boolean(out[col])
  return out
}

export interface SupabaseConnectorOptions {
  /** PowerSync instance URL. When absent the app runs local-only (no sync). */
  powersyncUrl?: string
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly opts: SupabaseConnectorOptions,
  ) {}

  get syncEnabled(): boolean {
    return Boolean(this.opts.powersyncUrl)
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    if (!this.opts.powersyncUrl) return null
    const {
      data: { session },
      error,
    } = await this.supabase.auth.getSession()
    if (error) throw error
    if (!session) return null
    return {
      endpoint: this.opts.powersyncUrl,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await database.getNextCrudTransaction()
    if (!tx) return

    // Without a user session every request would go out as `anon` and be rejected; retry later instead.
    const {
      data: { session },
    } = await this.supabase.auth.getSession()
    if (!session) throw new Error('No Supabase session; upload will retry after sign-in')

    for (const op of tx.crud) {
      const table = this.supabase.from(op.table)
      const data = toServerRow(op.table, op.opData ?? {})
      let result: { error: { code?: string; message: string } | null }
      switch (op.op) {
        case UpdateType.PUT:
          // Default categories are seeded on every device with the same ids: never let a fresh
          // device's defaults overwrite the server copy (the user's renames/order win).
          result =
            op.table === 'categories'
              ? await table.upsert({ ...data, id: op.id }, { onConflict: 'id', ignoreDuplicates: true })
              : await table.upsert({ ...data, id: op.id })
          break
        case UpdateType.PATCH:
          result = await table.update(data).eq('id', op.id)
          break
        case UpdateType.DELETE:
          result = await table.delete().eq('id', op.id)
          break
      }
      if (result.error) {
        if (isAlreadyPosted(result.error)) continue
        if (!isPermanentError(result.error.code, result.error.message)) throw result.error
        // Never block the queue on a row the server will always reject: park it for the user.
        await database.execute(
          'insert into upload_issues (id, table_name, row_id, op, code, message, payload, created_at) values (uuid(), ?, ?, ?, ?, ?, ?, ?)',
          [op.table, op.id, op.op, result.error.code ?? '', result.error.message, JSON.stringify(op.opData ?? {}), new Date().toISOString()],
        )
      }
    }
    await tx.complete()
  }
}
