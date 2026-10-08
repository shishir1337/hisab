import type { NextRequest } from 'next/server'

/**
 * An absolute URL on the address the visitor actually used. Behind a reverse proxy, `request.nextUrl`
 * carries the app's own listen address (e.g. https://localhost:3008), so redirects built from it send
 * people to localhost. The proxy forwards the real `Host` (nginx: `proxy_set_header Host $host`) and
 * the scheme (`X-Forwarded-Proto`). `X-Forwarded-Host` is deliberately ignored: a client can send it,
 * which would turn sign-in redirects into an open redirect.
 */
export function publicUrl(request: NextRequest, pathname: string, search = ''): URL {
  const host = request.headers.get('host') ?? request.nextUrl.host
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : request.nextUrl.protocol.replace(':', '')
  const url = new URL(`${proto}://${host}`)
  url.pathname = pathname
  url.search = search
  return url
}
