/** Calendar-date helpers. Days are `YYYY-MM-DD` strings in the user's timezone; math is done in UTC. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Local calendar day of an instant in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    formatters.set(timeZone, f)
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Local hour (0–23) of an instant in `timeZone`. */
export function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at)
  return Number(h)
}

const toUtc = (day: string) => new Date(`${day}T00:00:00Z`)
const fromUtc = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  const d = toUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000)
}

export function monthRange(day: string): { start: string; end: string } {
  const d = toUtc(day)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { start: fromUtc(start), end: fromUtc(end) }
}

export function addMonths(day: string, n: number): string {
  const d = toUtc(day)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return fromUtc(target)
}

export function monthLabel(day: string): string {
  const d = toUtc(day)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "Today", "Yesterday", "Mon, 5 Oct", or "31 Dec 2025" for other years. */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(day, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const d = toUtc(day)
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  if (day.slice(0, 4) !== today.slice(0, 4)) return `${date} ${d.getUTCFullYear()}`
  return `${WEEKDAYS[d.getUTCDay()]}, ${date}`
}

/** Groups rows by `occurred_on`, newest day first, preserving row order within a day. */
export function groupByDay<T extends { occurred_on: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.occurred_on)
    if (list) list.push(r)
    else map.set(r.occurred_on, [r])
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([day, rows]) => ({ day, rows }))
}
