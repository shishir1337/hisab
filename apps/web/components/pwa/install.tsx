'use client'

import { Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { BrandTile } from '@/components/ui/brand-tile'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toaster'
import { haptic } from '@/lib/haptics'
import { flags, promptInstall, usePwa } from '@/lib/pwa'

/* The iOS "how to install" sheet is opened from several places (menu, Home card, first-visit nudge). */
let iosSheetOpen = false
const sheetListeners = new Set<() => void>()
const setIosSheet = (open: boolean) => {
  iosSheetOpen = open
  sheetListeners.forEach((l) => l())
}
const subscribeSheet = (l: () => void) => {
  sheetListeners.add(l)
  return () => sheetListeners.delete(l)
}

async function installChromium() {
  const accepted = await promptInstall()
  if (accepted) {
    haptic('success')
    toast.success('Hisab is on your home screen')
  }
}

/**
 * What "Install Hisab" does here, or null when there's nothing to offer: Chromium → the browser's own install
 * dialog; iPhone/iPad Safari (not yet installed) → the Add to Home Screen steps. Inside the installed app → null.
 */
export function useInstallAction(): (() => void) | null {
  const { standalone, ios, canPrompt, installed } = usePwa()
  if (standalone || installed) return null
  if (canPrompt) return () => void installChromium()
  if (ios) return () => setIosSheet(true)
  return null
}

const CARD_DISMISSED = 'install-card-dismissed'

/**
 * Home, phone widths, Android/Chromium only: a quiet one-time card offering to install. Dismissing it is
 * remembered; the account menu keeps the option. (iPhone gets the steps sheet at a better moment instead.)
 */
export function InstallCard() {
  const { standalone, canPrompt, installed } = usePwa()
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => setDismissed(flags.get(CARD_DISMISSED) === '1'), [])
  if (standalone || installed || !canPrompt || dismissed) return null
  const dismiss = () => {
    flags.set(CARD_DISMISSED)
    setDismissed(true)
  }
  return (
    <div className="install-card flex items-center gap-3 rounded-card border border-border bg-surface p-3 pr-2 md:hidden">
      <BrandTile className="size-10 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold tracking-[-0.01em]">Install Hisab</p>
        <p className="text-[12.5px] leading-[17px] text-text-muted">Full screen, one tap away, works offline.</p>
      </div>
      <Button size="sm" onClick={() => void installChromium()}>
        Install
      </Button>
      <button type="button" aria-label="Not now" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-text-faint active:bg-surface-muted">
        <X className="size-4" />
      </button>
    </div>
  )
}

const IOS_SEEN = 'ios-install-seen'
const VISITS = 'visits'

/**
 * iPhone/iPad in Safari (never inside the installed app): the Add to Home Screen steps, shown by itself once —
 * on the second visit, or right after the first sign-in — and any time from the account menu afterwards.
 */
export function IosInstallSheet() {
  const open = useSyncExternalStore(subscribeSheet, () => iosSheetOpen, () => false)
  const { ios, standalone } = usePwa()

  useEffect(() => {
    if (!ios || standalone || flags.get(IOS_SEEN) === '1') return
    // Count visits (one per browser session).
    let visits = Number(flags.get(VISITS) ?? '0')
    try {
      if (!sessionStorage.getItem('hisab:counted')) {
        sessionStorage.setItem('hisab:counted', '1')
        visits += 1
        flags.set(VISITS, String(visits))
      }
    } catch {}
    let justSignedIn = false
    try {
      justSignedIn = sessionStorage.getItem('hisab:just-signed-in') === '1'
      sessionStorage.removeItem('hisab:just-signed-in')
    } catch {}
    if (visits < 2 && !justSignedIn) return
    // Let Home settle first; it's a suggestion, not a gate.
    const t = setTimeout(() => setIosSheet(true), 2500)
    return () => clearTimeout(t)
  }, [ios, standalone])

  const onOpenChange = (o: boolean) => {
    setIosSheet(o)
    if (!o) flags.set(IOS_SEEN)
  }

  if (!ios || standalone) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Hisab to your Home Screen" description="It opens full screen like an app, and works offline.">
        <ol className="flex flex-col gap-2.5">
          <Step n={1}>
            Tap <Glyph icon={<Share />} label="Share" /> in Safari’s toolbar
            <span className="block text-[12.5px] text-text-faint">At the bottom of the screen, or next to the address bar.</span>
          </Step>
          <Step n={2}>
            Scroll down and tap <Glyph icon={<SquarePlus />} label="Add to Home Screen" />
          </Step>
          <Step n={3}>
            Tap <span className="font-semibold">Add</span>, then open Hisab from your Home Screen
          </Step>
        </ol>
        <div className="sheet-footer sticky -bottom-5 z-10 -mx-5 -mb-5 mt-5 bg-surface px-5 pt-1 pb-5 md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
          <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-[14px] border border-border-subtle bg-surface-muted/50 px-3.5 py-3 text-[14.5px] leading-[22px]">
      <span aria-hidden className="num grid size-[22px] shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-brand-fg">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function Glyph({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-[8px] border border-border bg-surface px-1.5 py-0.5 align-middle text-[13px] font-semibold whitespace-nowrap [&>svg]:size-[15px] [&>svg]:text-[#0a84ff]">
      {icon}
      {label}
    </span>
  )
}
