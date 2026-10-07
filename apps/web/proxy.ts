import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Skip static assets, PowerSync worker/wasm files and images.
  matcher: ['/((?!_next/static|_next/image|@powersync|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|js|map)$).*)'],
}
