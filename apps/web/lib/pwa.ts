'use client'

import { useSyncExternalStore } from 'react'

/** The `beforeinstallprompt` event (Chromium only; not in TypeScript's DOM lib). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** Running as an installed app (home-screen icon), not in a browser tab. */
  standalone: boolean
  /** iPhone / iPad (incl. iPadOS that reports itself as a Mac). */
  ios: boolean
  /** Chromium captured an install prompt we can show from our own button. */
  canPrompt: boolean
  /** Installed during this visit (hide every install affordance). */
  installed: boolean
}

const SERVER: PwaState = { standalone: false, ios: false, canPrompt: false, installed: false }
let state: PwaState = SERVER
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

let started = false
/** Called once from <PwaClient />: reads the environment and starts listening for install events. */
export function startPwaState() {
  if (started || typeof window === 'undefined') return
  started = true
  // The early inline script in the root layout may have caught the prompt before React was running.
  const early = (window as unknown as { __hisabInstallPrompt?: InstallPromptEvent }).__hisabInstallPrompt
  if (early) deferred = early
  state = { standalone: isStandalone(), ios: isIOS(), canPrompt: Boolean(early), installed: false }
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's mini-infobar quiet; we offer "Install Hisab" in the account menu and on Home instead.
    e.preventDefault()
    deferred = e as InstallPromptEvent
    set({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, installed: true })
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ standalone: isStandalone() }))
  listeners.forEach((l) => l())
}

/** Shows the browser's install dialog (Chromium). Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  set({ canPrompt: false })
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') set({ installed: true })
  return outcome === 'accepted'
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function usePwa(): PwaState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  )
}

/** One-time UI flags (dismissed cards, seen sheets). Storage can be unavailable (private mode): fail quiet. */
export const flags = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`hisab:${key}`)
    } catch {
      return null
    }
  },
  set(key: string, value = '1') {
    try {
      localStorage.setItem(`hisab:${key}`, value)
    } catch {}
  },
}

/** Tell the service worker to cache what this page already loaded, plus the main tab pages. */
export function warmOfflineCache(pages: string[]) {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.ready.then((reg) => {
    const loaded = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin))
    reg.active?.postMessage({ type: 'WARM', urls: [...new Set([...loaded, ...pages])] })
  })
}

/** On sign-out: forget cached pages (they only hold the app shell, but there's no reason to keep them). */
export function clearOfflinePages() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PAGES' })
}
