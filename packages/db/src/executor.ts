/**
 * The minimal database surface the shared queries and mutations need. PowerSync's database
 * (web and React Native) satisfies it structurally; tests use node:sqlite.
 */
export interface Executor {
  execute(sql: string, params?: unknown[]): Promise<unknown>
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

/** Runs `fn` atomically when the database supports write transactions (PowerSync does); tests run it directly. */
export async function atomic<T>(ex: Executor, fn: (tx: Executor) => Promise<T>): Promise<T> {
  const tx = ex as Executor & { writeTransaction?: (cb: (t: Executor) => Promise<T>) => Promise<T> }
  return tx.writeTransaction ? tx.writeTransaction(fn) : fn(ex)
}
