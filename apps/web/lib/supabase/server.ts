import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Supabase client for Route Handlers / Server Components (reads and writes the session cookies). */
export async function getServerSupabase() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) store.set(name, value, options)
      },
    },
  })
}
