'use client'

import { useEffect } from 'react'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { IosInstallSheet } from './install'
import { warmOfflineCache } from '@/lib/pwa'

/** Every tab and page of the signed-in app: cached for offline cold starts once the user is in. */
const APP_PAGES = ['/', '/activity', '/plan', '/people', '/reports', '/settings']

/**
 * Signed-in PWA duties (inside the app layout, once the local database is open):
 * - asks the browser to keep this site's storage (the local database) instead of evicting it under pressure;
 * - warms the offline cache with the app pages and everything this page already loaded;
 * - opens the quick log for the "Log money" home-screen shortcut (`/?log=1`);
 * - hosts the iPhone "Add to Home Screen" sheet.
 */
export function AppPwa() {
  const quickLog = useQuickLog()

  useEffect(() => {
    void requestPersistence()
    // After the page has settled, so warming never competes with the first render or the first sync.
    const t = setTimeout(() => warmOfflineCache(APP_PAGES), 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('log') !== '1') return
    url.searchParams.delete('log')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    quickLog.open()
  }, [quickLog])

  return <IosInstallSheet />
}

async function requestPersistence() {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return
    await navigator.storage.persist()
  } catch {
    // Not supported (older Safari): the browser decides.
  }
}
