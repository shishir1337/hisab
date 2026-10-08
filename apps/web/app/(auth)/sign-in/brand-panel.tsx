'use client'

import { Bell, ChartNoAxesColumn, Check, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { reducedMotion } from '@/lib/motion'

/** One loop of the preview story; the CSS timings in globals.css (".si-*") are laid out inside it. */
const LOOP_MS = 11_000

/** Desktop-only ink panel: brand, a small live-looking product preview and the promise. */
export function BrandPanel() {
  return (
    <aside className="si-panel sticky top-3 m-3 hidden h-[calc(100dvh-24px)] min-h-[640px] flex-col justify-between rounded-[28px] p-10 lg:flex xl:p-12" aria-label="About Hisab">
      <BrandMark inverted />

      <div className="flex min-h-0 flex-1 items-center justify-center py-6">
        <ProductPreview />
      </div>

      <div className="si-rise max-w-[540px]">
        <p className="text-[30px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance xl:text-[34px]">
          Know where your money goes <span className="text-white/45">— without the month-end struggle.</span>
        </p>
        <ul className="mt-6 grid gap-2.5 text-[14px] text-white/70 [@media(max-height:780px)]:hidden">
          <Benefit icon={<ChartNoAxesColumn />}>Every taka in one calm view, down to the category</Benefit>
          <Benefit icon={<Bell />}>Bills and dues remind you before they’re late</Benefit>
          <Benefit icon={<WifiOff />}>Log a spend in seconds — even offline</Benefit>
        </ul>
      </div>
    </aside>
  )
}

function Benefit({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-white/[0.07] text-white/80 ring-1 ring-white/10 [&_svg]:size-[15px]">
        {icon}
      </span>
      {children}
    </li>
  )
}

/** The brand tile + wordmark. `inverted` for use on the ink panel. */
export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={
          inverted
            ? 'grid size-9 place-items-center rounded-[11px] bg-white text-[15px] font-bold text-[#141414] shadow-[0_1px_2px_rgb(0_0_0/0.2),0_6px_16px_-6px_rgb(0_0_0/0.5)]'
            : 'grid size-9 place-items-center rounded-[11px] bg-brand text-[15px] font-bold text-brand-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_6px_16px_-8px_rgb(0_0_0/0.35)]'
        }
      >
        H
      </span>
      <span className="text-[18px] font-semibold tracking-[-0.02em]">Hisab</span>
    </div>
  )
}

/* ───────────── Preview ───────────── */

const SPENT = 48_250
// Daily cumulative spend for the month so far, as a gentle upward line (0..1 of the chart height).
const SERIES = [0.06, 0.1, 0.13, 0.2, 0.24, 0.27, 0.36, 0.4, 0.43, 0.47, 0.55, 0.58, 0.61, 0.7, 0.73, 0.76, 0.82, 0.86, 0.9]

function ProductPreview() {
  const [loop, setLoop] = useState(0)
  useEffect(() => {
    if (reducedMotion()) return
    const t = setInterval(() => {
      // Don't burn frames in a background tab; pick the story up when it's visible again.
      if (document.visibilityState === 'visible') setLoop((n) => n + 1)
    }, LOOP_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <div aria-hidden className="relative w-full max-w-[380px] select-none [@media(max-height:800px)]:[zoom:0.86]">
      <div key={loop} className="si-scene">
        {/* The toast lands in the gap above the cards, like the app's own toast. */}
        <div className="mb-3 flex h-11 justify-center">
          <div className="si-toast flex h-11 items-center gap-2.5 rounded-full bg-white py-1.5 pr-4 pl-2 text-[13.5px] font-medium text-[#141414] shadow-[0_1px_2px_rgb(0_0_0/0.2),0_14px_30px_-10px_rgb(0_0_0/0.65)]">
            <span className="si-toast-icon grid size-7 place-items-center rounded-full bg-[#15803D] text-white">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            Rent marked as paid
          </div>
        </div>

        <BalanceCard loop={loop} />

        <div className="si-glass mt-3 rounded-[20px] p-4 pb-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">Due soon</span>
            <span className="text-[12px] text-white/45">3 bills</span>
          </div>
          <DueRow name="Rent" when="Today" amount="18,000" at="2.3s" />
          <DueRow name="Electricity" when="Tomorrow" amount="2,450" at="3.5s" />
          <DueRow name="Internet" when="In 5 days" amount="1,200" />
        </div>
      </div>
    </div>
  )
}

function BalanceCard({ loop }: { loop: number }) {
  const shown = useLoopCountUp(SPENT, loop)
  const w = 380
  const h = 64
  const pts = SERIES.map((v, i) => [(i / (SERIES.length - 1)) * w, h - 4 - v * (h - 10)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]!

  return (
    <div className="si-glass overflow-hidden rounded-[20px] p-5 pb-0">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12.5px] text-white/55">Spent in October</div>
          <div className="num mt-1 text-[32px] leading-none font-semibold">
            <span className="currency-code">BDT</span>
            {shown.toLocaleString('en-US')}
          </div>
        </div>
        <span className="si-delta mt-0.5 rounded-full bg-[#4ADE80]/[0.14] px-2 py-0.5 text-[12px] font-semibold text-[#86EFAC]">−8% vs Sep</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 -mx-5 block h-16 w-[calc(100%+40px)]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="si-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="si-spark-area" d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#si-spark-fill)" />
        <path className="si-spark-line" d={line} pathLength={1} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="si-spark-dot" cx={lx - 5} cy={ly} r="3.5" fill="#fff" />
      </svg>
    </div>
  )
}

function DueRow({ name, when, amount, at }: { name: string; when: string; amount: string; at?: string }) {
  const done = Boolean(at)
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-1 py-2" style={at ? ({ '--at': at } as React.CSSProperties) : undefined}>
      <span className={done ? 'si-tick-wrap' : undefined}>
        <span className={`grid size-[22px] place-items-center rounded-full border-[1.5px] ${done ? 'si-tick' : 'border-white/28'}`}>
          {done && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none">
              <path d="M2.5 6.3 5 8.6l4.5-5" pathLength={1} stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">
          <span className={done ? 'si-strike' : undefined}>{name}</span>
        </div>
        <div className="text-[12px] text-white/45">{when}</div>
      </div>
      <div className={`num text-[13.5px] font-semibold ${done ? 'si-fade-done' : ''}`}>
        <span className="currency-code">BDT</span>
        {amount}
      </div>
    </div>
  )
}

/** Counts 0 → target at the start of every loop (rAF, ease-out); reduced motion shows the target. */
function useLoopCountUp(target: number, loop: number): number {
  const [value, setValue] = useState(target)
  useEffect(() => {
    if (reducedMotion()) return
    let frame = 0
    const t0 = performance.now() + 250
    const dur = 1500
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - t0) / dur))
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, loop])
  return value
}
