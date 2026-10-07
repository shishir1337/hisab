import { addDays, localDate } from './dates'
import { formatMoney, type Grouping } from './money'
import type { LendingDirection } from './people'

/** Spec §6.8 — pure notification planner; the app reconciles its output with the OS scheduler. */

export type NotificationKind = 'emi' | 'lending' | 'recurring' | 'nudge'

export interface PlannedNotification {
  id: string
  kind: NotificationKind
  fireAt: Date
  title: string
  body: string
  deepLink: string
}

export interface PlanInput {
  currency: string
  grouping: Grouping
  loans: { id: string; name: string; nextDueDate: string | null; emi_amount_minor: number }[]
  lendings: {
    id: string
    partyId: string
    name: string
    direction: LendingDirection
    outstanding: number
    due_on: string | null
    intervalDays?: number | null
  }[]
  recurring: { key: string; title: string; date: string; amount_minor: number; type: 'income' | 'expense' | 'transfer' }[]
  nudge: { enabled: boolean; time: string }
  loggedToday: boolean
  reminderIntervalDays: number
}

const WINDOW_DAYS = 30
const MAX_PENDING = 64
const PRIORITY: NotificationKind[] = ['emi', 'lending', 'recurring', 'nudge']
const MORNING = '10:00'

/** Minutes the zone is ahead of UTC at instant `at`. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** The instant of local wall-clock `time` (HH:MM) on `day` in `timeZone`. */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000
  // Second pass settles DST transitions.
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000)
}

export function planNotifications(input: PlanInput, now: Date, timeZone: string): PlannedNotification[] {
  const today = localDate(now, timeZone)
  const lastDay = addDays(today, WINDOW_DAYS)
  const money = (m: number) => formatMoney(m, input.currency, { grouping: input.grouping }).text
  const out: PlannedNotification[] = []
  const add = (n: Omit<PlannedNotification, 'fireAt'> & { day: string; time?: string }) => {
    const fireAt = zonedInstant(n.day, n.time ?? MORNING, timeZone)
    if (fireAt.getTime() <= now.getTime() || n.day > lastDay) return
    const { day: _d, time: _t, ...rest } = n
    out.push({ ...rest, fireAt })
  }

  for (const l of input.loans) {
    if (!l.nextDueDate) continue
    const body = `EMI of ${money(l.emi_amount_minor)}`
    const link = `/loan?id=${l.id}`
    if (l.nextDueDate >= today) {
      const before = addDays(l.nextDueDate, -1)
      add({ id: `emi:${l.id}:${before}`, kind: 'emi', day: before, title: `${l.name} is due tomorrow`, body, deepLink: link })
      add({ id: `emi:${l.id}:${l.nextDueDate}`, kind: 'emi', day: l.nextDueDate, title: `${l.name} is due today`, body, deepLink: link })
    } else {
      // Overdue: remind at the next 10:00 until it's marked paid (replanned on every change).
      for (const day of [today, addDays(today, 1)]) {
        const before = out.length
        add({ id: `emi:${l.id}:${day}`, kind: 'emi', day, title: `${l.name} EMI is overdue`, body, deepLink: link })
        if (out.length > before) break
      }
    }
  }

  for (const l of input.lendings) {
    if (!l.due_on || l.outstanding <= 0) continue
    const step = Math.max(1, l.intervalDays ?? input.reminderIntervalDays)
    const title = l.direction === 'lent' ? `${l.name} owes you ${money(l.outstanding)}` : `You owe ${l.name} ${money(l.outstanding)}`
    const body = l.direction === 'lent' ? 'Tap to send a friendly reminder.' : 'Tap to record a repayment.'
    for (let day = l.due_on; day <= lastDay; day = addDays(day, step)) {
      add({ id: `lend:${l.id}:${day}`, kind: 'lending', day, title, body, deepLink: `/person?id=${l.partyId}` })
    }
  }

  for (const r of input.recurring) {
    const verb = r.type === 'income' ? 'expected today' : 'due today'
    add({ id: `rec:${r.key}`, kind: 'recurring', day: r.date, title: `${r.title} ${verb}`, body: money(r.amount_minor), deepLink: '/' })
  }

  if (input.nudge.enabled) {
    for (let day = today; day <= lastDay; day = addDays(day, 1)) {
      if (day === today && input.loggedToday) continue
      add({ id: `nudge:${day}`, kind: 'nudge', day, time: input.nudge.time, title: 'Anything to log today?', body: 'Takes 3 seconds — keeps month-end painless.', deepLink: '/?log=1' })
    }
  }

  const byPriority = PRIORITY.flatMap((k) => out.filter((n) => n.kind === k).sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()))
  return byPriority.slice(0, MAX_PENDING).sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
}
