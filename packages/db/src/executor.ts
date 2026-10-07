/**
 * The minimal database surface the shared queries and mutations need. PowerSync's database
 * (web and React Native) satisfies it structurally; tests use node:sqlite.
 */
export interface Executor {
  execute(sql: string, params?: unknown[]): Promise<unknown>
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}
