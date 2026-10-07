/**
 * Minimal MD5 (RFC 1321) over UTF-8. Used only to derive deterministic ids that match Postgres
 * `md5(text)::uuid` (e.g. default categories seeded both on the server and on an offline device).
 * Not for security.
 */

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

function utf8(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    let c = ch.codePointAt(0)!
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
      c = 0
    }
  }
  return out
}

export function md5(input: string): string {
  const bytes = utf8(input)
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 0xff : 0)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < bytes.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => bytes[off + i * 4]! | (bytes[off + i * 4 + 1]! << 8) | (bytes[off + i * 4 + 2]! << 16) | (bytes[off + i * 4 + 3]! << 24))
    let [A, B, C, D] = [a0, b0, c0, d0]
    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) [F, g] = [(B & C) | (~B & D), i]
      else if (i < 32) [F, g] = [(D & B) | (~D & C), (5 * i + 1) % 16]
      else if (i < 48) [F, g] = [B ^ C ^ D, (3 * i + 5) % 16]
      else [F, g] = [C ^ (B | ~D), (7 * i) % 16]
      const tmp = D
      D = C
      C = B
      const sum = (A + F + K[i]! + M[g]!) | 0
      B = (B + ((sum << S[i]!) | (sum >>> (32 - S[i]!)))) | 0
      A = tmp
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  return [a0, b0, c0, d0]
    .map((w) => Array.from({ length: 4 }, (_, i) => ((w >>> (8 * i)) & 0xff).toString(16).padStart(2, '0')).join(''))
    .join('')
}

/** Same string Postgres produces for `md5(input)::uuid`. */
export function md5Uuid(input: string): string {
  const h = md5(input)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
