'use client'

import { tokens } from '@hisab/tokens'
import { useEffect } from 'react'
import { toast } from '@/components/ui/toaster'
import { startPwaState } from '@/lib/pwa'

const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_BUILD ?? 'dev'}`
/** Re-check for a new deploy when the app comes back to the foreground, at most this often. */
const UPDATE_EVERY = 30 * 60 * 1000

/**
 * App-wide PWA plumbing (renders nothing):
 * - marks <html> with `data-standalone` / `data-ios` for CSS, and stops iOS's zoom-on-focus;
 * - tracks the on-screen keyboard through visualViewport (`--kb`, `--vvh`, `data-keyboard`) so bottom sheets
 *   and their Save button sit above it on iOS, and the tab bar hides while typing;
 * - registers the service worker (production only) and offers "Update available — Reload" for a new deploy.
 */
export function PwaClient() {
  useEffect(() => {
    startPwaState()
    const html = document.documentElement
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    if (standalone) html.dataset.standalone = ''
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
      html.dataset.ios = ''
      // iOS zooms into any field under 16 px on focus and stays zoomed. `maximum-scale=1` stops that; iOS ignores it
      // for pinch-zoom (since iOS 10), so people can still zoom. iOS only: Android would lose pinch-zoom.
      // Re-applied if navigation re-renders the viewport tag.
      const lock = () => {
        const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
        if (vp && !vp.content.includes('maximum-scale')) vp.content = `${vp.content}, maximum-scale=1`
      }
      lock()
      const mo = new MutationObserver(lock)
      mo.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] })
      return () => mo.disconnect()
    }
  }, [])

  useEffect(() => trackKeyboard(), [])
  useEffect(() => syncThemeColor(), [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    let disposed = false
    let lastCheck = Date.now()
    let reloading = false
    let reg: ServiceWorkerRegistration | undefined

    const offerUpdate = (worker: ServiceWorker) => {
      toast.info('Update available', {
        duration: 24 * 60 * 60 * 1000,
        action: {
          label: 'Reload',
          onClick: () => {
            reloading = true
            worker.postMessage({ type: 'SKIP_WAITING' })
          },
        },
      })
    }
    const onControllerChange = () => {
      // Only reload for an update the user asked for (the very first install also takes control).
      if (reloading) window.location.reload()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !reg || Date.now() - lastCheck < UPDATE_EVERY) return
      lastCheck = Date.now()
      void reg.update().catch(() => {})
    }

    ;(async () => {
      try {
        reg = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' })
      } catch (e) {
        console.warn('service worker registration failed', e)
        return
      }
      if (disposed) return
      // A new build is already waiting (installed on an earlier visit while this tab was open elsewhere).
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const next = reg?.installing
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(next)
        })
      })
    })()
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}

/**
 * The theme-color metas follow the system scheme; when the in-app theme differs (Settings → Appearance), point
 * both at the page colour actually shown, so Android's status bar / toolbar matches the app.
 */
function syncThemeColor() {
  const html = document.documentElement
  const apply = () => {
    const color = html.classList.contains('dark') ? tokens.color.dark.page : tokens.color.light.page
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      if (m.content !== color) m.content = color
    })
  }
  apply()
  const mo = new MutationObserver(apply)
  mo.observe(html, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}

function trackKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  const html = document.documentElement
  let frame = 0
  const update = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // How much of the layout viewport's bottom is covered (the keyboard on iOS; ~0 on Android, where the
      // layout viewport itself shrinks with `interactive-widget=resizes-content`).
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      html.style.setProperty('--kb', `${kb}px`)
      html.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
      // Keyboard open: a text field has focus and the visible height dropped well below the screen's.
      const typing = isTextField(document.activeElement)
      const open = typing && (kb > 120 || vv.height < window.screen.height * 0.62)
      if (open) html.dataset.keyboard = ''
      else delete html.dataset.keyboard
    })
  }
  update()
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  document.addEventListener('focusin', update)
  document.addEventListener('focusout', update)
  return () => {
    cancelAnimationFrame(frame)
    vv.removeEventListener('resize', update)
    vv.removeEventListener('scroll', update)
    document.removeEventListener('focusin', update)
    document.removeEventListener('focusout', update)
  }
}

function isTextField(el: Element | null) {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable) return true
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'reset'].includes(el.type)
}
