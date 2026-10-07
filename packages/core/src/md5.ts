/**
 * Minimal MD5 (RFC 1321) over UTF-8. Used only to derive deterministic ids that match Postgres
 * `md5(text)::uuid` (e.g. default categories seeded both on the server and on an offline device).
 * Not for security.
 */

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
// RFC 1321 T[i] constants, hard-coded so ids never depend on a platform's Math.sin precision.
// prettier-ignore
const K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

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
