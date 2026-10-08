import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { publicUrl } from './public-url'

const req = (url: string, headers: Record<string, string>) => new NextRequest(url, { headers })

describe('publicUrl', () => {
  it('uses the proxied Host and scheme, not the app listen address', () => {
    const r = req('https://localhost:3008/auth/callback?code=x', { host: 'hisab.arrowbin.com', 'x-forwarded-proto': 'https' })
    expect(publicUrl(r, '/').toString()).toBe('https://hisab.arrowbin.com/')
    expect(publicUrl(r, '/sign-in', '?error=link').toString()).toBe('https://hisab.arrowbin.com/sign-in?error=link')
  })
  it('works without a proxy (local dev)', () => {
    const r = req('http://localhost:3001/auth/callback', { host: 'localhost:3001' })
    expect(publicUrl(r, '/activity').toString()).toBe('http://localhost:3001/activity')
  })
  it('ignores a client-supplied X-Forwarded-Host (no open redirect)', () => {
    const r = req('https://localhost:3008/auth/callback', { host: 'hisab.arrowbin.com', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })
    expect(publicUrl(r, '/').host).toBe('hisab.arrowbin.com')
  })
})
