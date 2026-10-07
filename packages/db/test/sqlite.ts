import { DatabaseSync } from 'node:sqlite'
import { AppSchema } from '../src/schema'
import type { Executor } from '../src/executor'

type SchemaShape = { tables: { name: string; columns: { name: string; type: string }[] }[] }

/** In-memory SQLite with the app's tables (plain tables standing in for PowerSync's views). */
export function createTestDb(): Executor & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  for (const t of (AppSchema as unknown as SchemaShape).tables) {
    const cols = t.columns.map((c) => `${c.name} ${c.type}`).join(', ')
    raw.exec(`create table ${t.name} (id text primary key not null, ${cols})`)
  }
  const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null)
  return {
    raw,
    async execute(sql, params = []) {
      return raw.prepare(sql).run(...(params as never[]))
    },
    async getAll<T>(sql: string, params: unknown[] = []) {
      return raw.prepare(sql).all(...(params as never[])).map((r: unknown) => plain<T>(r)!)
    },
    async getOptional<T>(sql: string, params: unknown[] = []) {
      return plain<T>(raw.prepare(sql).get(...(params as never[])))
    },
  }
}
