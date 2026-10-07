import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in']

/**
 * Refreshes the Supabase session cookie and performs the optimistic auth redirect.
 * Real authorization is enforced by Postgres RLS; this only keeps signed-out users off app routes.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  // Must run right after creating the client: it refreshes an expired session.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  const redirectTo = (pathname: string, keepNext: boolean) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = keepNext && path !== '/' ? `?next=${encodeURIComponent(path)}` : ''
    const redirect = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }

  if (!signedIn && !isPublic) return redirectTo('/sign-in', true)
  if (signedIn && isPublic) return redirectTo('/', false)
  return response
}
