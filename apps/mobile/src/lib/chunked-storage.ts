export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/**
 * Stores values in fixed-size chunks (`key.0`, `key.1`, … plus `key.n` = count).
 * iOS Keychain / expo-secure-store values should stay under ~2KB, but Supabase sessions are larger.
 */
export function createChunkedStorage(backend: KeyValueBackend, chunkSize = 1800): KeyValueBackend {
  const countKey = (key: string) => `${key}.n`
  const chunkKey = (key: string, i: number) => `${key}.${i}`

  async function count(key: string): Promise<number> {
    const n = Number(await backend.getItem(countKey(key)))
    return Number.isInteger(n) && n > 0 ? n : 0
  }

  async function clear(key: string, from = 0) {
    const n = await count(key)
    for (let i = from; i < n; i++) await backend.removeItem(chunkKey(key, i))
  }

  return {
    async getItem(key) {
      const n = await count(key)
      if (n === 0) return null
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const part = await backend.getItem(chunkKey(key, i))
        if (part === null) return null
        parts.push(part)
      }
      return parts.join('')
    },
    async setItem(key, value) {
      const n = Math.max(1, Math.ceil(value.length / chunkSize))
      await clear(key, n)
      for (let i = 0; i < n; i++) await backend.setItem(chunkKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize))
      await backend.setItem(countKey(key), String(n))
    },
    async removeItem(key) {
      await clear(key)
      await backend.removeItem(countKey(key))
    },
  }
}
