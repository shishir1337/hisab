import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * One id per build: the service worker is registered as `/sw.js?v=<build>`, so every deploy installs a fresh
 * worker (with fresh caches) and the app can offer "Update available — Reload".
 */
const APP_BUILD = (process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? '') + Date.now().toString(36)

/** Security headers for every response. A CSP for scripts is left out on purpose (see README → Deploy web). */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  // Framing, plugins, <base> and form targets locked down; script/connect sources left to the defaults.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // The PowerSync worker (SharedWorker + OPFS/IndexedDB VFS) runs same-origin; keep cross-origin openers out.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_BUILD: APP_BUILD },
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@hisab/core', '@hisab/tokens', '@hisab/db'],
  turbopack: {
    root: path.join(__dirname, '../..'),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        // The service worker must always be revalidated, or an old one could linger for up to 24 h.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // Generated once, never change for a given file name in practice; a day of caching is plenty.
        source: '/:dir(icons|splash)/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        // PowerSync worker + wasm: stable per release; let browsers revalidate cheaply.
        source: '/@powersync/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }],
      },
    ]
  },
}

export default nextConfig
