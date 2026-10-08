/*
 * Hisab service worker: makes the installed app open (and keep working) offline.
 *
 * The data never goes through here: it lives in the browser's SQLite database (PowerSync, IndexedDB) and syncs
 * over PowerSync's own connection. This worker only keeps the app *shell* — pages, scripts, styles, fonts, the
 * PowerSync worker/wasm files and icons — so that a cold start without a network still boots the app.
 *
 *   /_next/static/*, /@powersync/*   cache-first (content-hashed / pinned to this build)
 *   page navigations                 network-first (4 s), then the cached copy, then /offline
 *   icons, launch images, manifest   stale-while-revalidate
 *   everything else                  untouched: Supabase, PowerSync, /auth/*, RSC fetches, POSTs, other origins
 *
 * Versioned by the registration URL (`/sw.js?v=<build>`): each deploy installs a new worker, which waits until
 * the page says "reload" (the "Update available" toast), then drops the previous build's caches on activate.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const STATIC = `hisab-static-${VERSION}`
const PAGES = `hisab-pages-${VERSION}`
const ASSETS = `hisab-assets-${VERSION}`
const KEEP = [STATIC, PAGES, ASSETS]
const OFFLINE = '/offline'
const PRECACHE = [OFFLINE, '/manifest.webmanifest', '/icons/icon-192.png', '/icon.svg']
const NETWORK_TIMEOUT = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSETS)
      await Promise.all(
        PRECACHE.map(async (url) => {
          const res = await fetch(url, { cache: 'reload' })
          if (res.ok && !res.redirected) await cache.put(url, url === OFFLINE ? await asPage(res) : res)
        }),
      ).catch(() => {})
      // First install: take over right away (nothing to update from). Updates wait for the page's go-ahead.
      if (!self.registration.active) await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n.startsWith('hisab-') && !KEEP.includes(n)).map((n) => caches.delete(n)))
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {})
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  const msg = event.data || {}
  if (msg.type === 'SKIP_WAITING') self.skipWaiting()
  else if (msg.type === 'WARM' && Array.isArray(msg.urls)) event.waitUntil(warm(msg.urls))
  else if (msg.type === 'CLEAR_PAGES') event.waitUntil(caches.delete(PAGES))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    if (isPrivatePath(url.pathname)) return
    event.respondWith(navigate(event))
    return
  }
  const kind = classify(url)
  if (kind === 'static') event.respondWith(cacheFirst(req, STATIC))
  else if (kind === 'powersync') event.respondWith(cacheFirst(req, ASSETS))
  else if (kind === 'asset') event.respondWith(staleWhileRevalidate(event, ASSETS))
})

/** Routes whose responses must never come from a cache: auth hand-offs and the signed-out page. */
function isPrivatePath(path) {
  return path.startsWith('/auth/') || path === '/auth' || path.startsWith('/sign-in')
}

function classify(url) {
  const p = url.pathname
  if (p.startsWith('/_next/static/')) return 'static'
  if (p.startsWith('/@powersync/')) return 'powersync'
  if (p.startsWith('/icons/') || p.startsWith('/splash/') || p === '/manifest.webmanifest' || p === '/favicon.ico' || p === '/icon.svg' || p.startsWith('/apple-icon')) return 'asset'
  return null
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.status === 200) cache.put(req, res.clone()).catch(() => {})
  return res
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(event.request, { ignoreSearch: true })
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok && !res.redirected) cache.put(event.request, res.clone()).catch(() => {})
      return res
    })
    .catch(() => hit || Response.error())
  if (hit) {
    event.waitUntil(network.catch(() => {}))
    return hit
  }
  return network
}

/** Pages are cached by path only (`/?log=1` falls back to `/`). */
const pageKey = (url) => new URL(url).pathname

async function navigate(event) {
  const req = event.request
  const cache = await caches.open(PAGES)
  const key = pageKey(req.url)
  try {
    const res = await withTimeout(
      (async () => (await event.preloadResponse) || fetch(req))(),
      NETWORK_TIMEOUT,
      async () => (await cache.match(key)) || null,
    )
    // Only keep real app pages: not redirects to sign-in, not errors.
    if (res.ok && !res.redirected && res.type === 'basic' && !isPrivatePath(new URL(res.url || req.url).pathname)) {
      event.waitUntil(cache.put(key, res.clone()).catch(() => {}))
    }
    return res
  } catch {
    return (await cache.match(key)) || (await caches.match(OFFLINE)) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

/** Resolves with the network response, or after `ms` with the fallback if it has one (the network keeps going). */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(async () => {
      const alt = await fallback().catch(() => null)
      if (alt && !settled) {
        settled = true
        resolve(alt)
      }
    }, ms)
    promise.then(
      (res) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          resolve(res)
        }
      },
      (err) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(err)
        }
      },
    )
  })
}

/** A cached response that was redirected can't answer a navigation; rebuild it as a plain response. */
async function asPage(res) {
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
}

/**
 * The page lists what it loaded before this worker controlled it (scripts, styles, fonts) and the tab pages it
 * can show; cache whatever isn't cached yet, so the very next cold start works offline. Each warmed page's own
 * scripts are cached too, and so are the PowerSync worker + wasm files (listed in /@powersync/files.json at
 * build time): the database worker fetches them itself, out of the page's sight.
 */
async function warm(urls) {
  const all = new Set(urls)
  try {
    const res = await fetch('/@powersync/files.json', { cache: 'no-cache' })
    if (res.ok) for (const f of await res.json()) all.add(`/@powersync/${f}`)
  } catch {}
  const pageAssets = new Set()
  await Promise.all(
    [...all].map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin)
        if (url.origin !== self.location.origin) return
        const kind = classify(url)
        if (kind) return void (await warmAsset(url, kind))
        if (isPrivatePath(url.pathname) || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) return
        // A page: fetch it as a navigation would (cookies included) and keep it if it's the real page.
        const cache = await caches.open(PAGES)
        const key = url.pathname
        let res = await cache.match(key)
        if (!res) {
          const fresh = await fetch(url.pathname, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
          if (!fresh.ok || fresh.redirected || !(fresh.headers.get('content-type') || '').includes('text/html')) return
          await cache.put(key, fresh.clone())
          res = fresh
        }
        const html = await res.text()
        for (const m of html.matchAll(/\/_next\/static\/[^"'\\s)]+/g)) pageAssets.add(m[0])
      } catch {
        // Offline or gone: try again next time.
      }
    }),
  )
  await Promise.all([...pageAssets].map((p) => warmAsset(new URL(p, self.location.origin), 'static').catch(() => {})))
}

async function warmAsset(url, kind) {
  const cache = await caches.open(kind === 'static' ? STATIC : ASSETS)
  if (await cache.match(url.href, { ignoreVary: true })) return
  const res = await fetch(url.href)
  if (res.ok && res.status === 200) await cache.put(url.href, res)
}
