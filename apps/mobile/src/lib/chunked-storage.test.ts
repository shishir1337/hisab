import { describe, it, expect, beforeEach } from 'vitest'
import { createChunkedStorage, type KeyValueBackend } from './chunked-storage'

function memoryBackend(): KeyValueBackend & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  }
}

describe('createChunkedStorage', () => {
  let backend: ReturnType<typeof memoryBackend>
  beforeEach(() => {
    backend = memoryBackend()
  })

  it('round-trips a small value', async () => {
    const s = createChunkedStorage(backend, 10)
    await s.setItem('sb-auth', 'hello')
    expect(await s.getItem('sb-auth')).toBe('hello')
  })

  it('splits large values into chunks no bigger than the limit', async () => {
    const s = createChunkedStorage(backend, 10)
    const value = 'x'.repeat(25)
    await s.setItem('sb-auth', value)
    for (const [k, v] of backend.data) if (k !== 'sb-auth.n') expect(v.length).toBeLessThanOrEqual(10)
    expect(backend.data.get('sb-auth.n')).toBe('3')
    expect(await s.getItem('sb-auth')).toBe(value)
  })

  it('shrinking a value removes stale chunks', async () => {
    const s = createChunkedStorage(backend, 10)
    await s.setItem('k', 'a'.repeat(35))
    await s.setItem('k', 'b'.repeat(5))
    expect(await s.getItem('k')).toBe('bbbbb')
    expect([...backend.data.keys()].sort()).toEqual(['k.0', 'k.n'])
  })

  it('missing key returns null', async () => {
    expect(await createChunkedStorage(backend, 10).getItem('nope')).toBeNull()
  })

  it('a missing chunk returns null instead of a corrupted session', async () => {
    const s = createChunkedStorage(backend, 10)
    await s.setItem('k', 'z'.repeat(25))
    backend.data.delete('k.1')
    expect(await s.getItem('k')).toBeNull()
  })

  it('removeItem clears every chunk', async () => {
    const s = createChunkedStorage(backend, 10)
    await s.setItem('k', 'q'.repeat(25))
    await s.removeItem('k')
    expect(backend.data.size).toBe(0)
  })
})
