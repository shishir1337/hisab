import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Skip static assets, PowerSync worker/wasm files, images, the service worker and the public PWA files
  // (the manifest and robots.txt must load signed out: browsers fetch the manifest without credentials).
  matcher: ['/((?!_next/static|_next/image|@powersync|favicon.ico|manifest.webmanifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|js|map)$).*)'],
}
