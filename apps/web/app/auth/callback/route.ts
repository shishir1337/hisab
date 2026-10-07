import { safeNextPath } from '@hisab/core'
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * Completes sign-in from the emailed link, so login works even while the Supabase email template
 * still sends a link instead of the 6-digit code. Handles both the PKCE `code` and `token_hash` forms.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = safeNextPath(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType
  const supabase = await getServerSupabase()

  let error: string | null = null
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code)
    error = r.error?.message ?? null
  } else if (tokenHash) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    error = r.error?.message ?? null
  } else {
    error = url.searchParams.get('error_description') ?? 'missing code'
  }

  const dest = url.clone()
  dest.search = ''
  if (error) {
    dest.pathname = '/sign-in'
    dest.searchParams.set('error', 'link')
  } else {
    dest.pathname = next
  }
  return NextResponse.redirect(dest)
}
