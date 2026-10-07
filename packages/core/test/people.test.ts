import { describe, expect, it } from 'vitest'
import { budgetThresholdsCrossed, lendingStatus, reminderMessage, smsUrl, toE164, whatsappUrl } from '../src/people'
import { planNotifications, type PlanInput } from '../src/notify'

describe('lendingStatus', () => {
  const lent = { direction: 'lent' as const, principal_minor: 1500000, due_on: '2026-09-30', closed_at: null }
  it('open, nothing repaid', () => expect(lendingStatus({ ...lent, due_on: null }, 0, '2026-10-07')).toEqual({ outstanding: 1500000, status: 'open' }))
  it('partly paid and overdue → overdue wins', () => expect(lendingStatus(lent, 500000, '2026-10-07')).toEqual({ outstanding: 1000000, status: 'overdue' }))
  it('partly paid, not yet due', () => expect(lendingStatus({ ...lent, due_on: '2026-12-01' }, 500000, '2026-10-07')).toEqual({ outstanding: 1000000, status: 'partly_paid' }))
  it('over-paid is settled at zero, never negative', () => expect(lendingStatus(lent, 1600000, '2026-10-07')).toEqual({ outstanding: 0, status: 'settled' }))
  it('closed is settled', () => expect(lendingStatus({ ...lent, closed_at: '2026-10-01T00:00:00Z' }, 0, '2026-10-07').status).toBe('settled'))
  it('due today is not overdue', () => expect(lendingStatus({ ...lent, due_on: '2026-10-07' }, 0, '2026-10-07').status).toBe('open'))
})

describe('reminderMessage', () => {
  it('lent', () =>
    expect(reminderMessage({ name: 'Rafiq', amount: 'BDT 10,000', startedOn: '2026-09-02', direction: 'lent' })).toBe(
      'Hi Rafiq, just a gentle reminder about the BDT 10,000 from 2 Sep. Let me know when it works for you. Thanks!',
    ))
  it('borrowed reads as my own note', () =>
    expect(reminderMessage({ name: 'Karim', amount: 'BDT 5,000', startedOn: '2026-09-02', direction: 'borrowed' })).toBe(
      'Hi Karim, I haven’t forgotten the BDT 5,000 from 2 Sep — I’ll return it soon. Thanks for your patience!',
    ))
})

describe('urls', () => {
  it('whatsapp uses digits only and encodes text', () => expect(whatsappUrl('+8801712345678', 'Hi Rafiq & co')).toBe('https://wa.me/8801712345678?text=Hi%20Rafiq%20%26%20co'))
  it('sms', () => expect(smsUrl('+8801712345678', 'Hi')).toBe('sms:+8801712345678?body=Hi'))
})

describe('toE164', () => {
  it.each([
    ['01712345678', '+8801712345678'],
    ['01712-345678', '+8801712345678'],
    ['+880 1712 345678', '+8801712345678'],
    ['8801712345678', '+8801712345678'],
    ['+447700900123', '+447700900123'],
    ['12', null],
    ['hello', null],
    ['', null],
  ])('%s → %s', (input, want) => expect(toE164(input)).toBe(want))
})

describe('budgetThresholdsCrossed', () => {
  it('crossing 80%', () => expect(budgetThresholdsCrossed(7000, 8500, 10000)).toEqual([80]))
  it('crossing both at once', () => expect(budgetThresholdsCrossed(7000, 11000, 10000)).toEqual([80, 100]))
  it('already past', () => expect(budgetThresholdsCrossed(9000, 9500, 10000)).toEqual([]))
  it('exactly 100% counts', () => expect(budgetThresholdsCrossed(9000, 10000, 10000)).toEqual([100]))
})

describe('planNotifications', () => {
  const NOW = new Date('2026-10-07T04:00:00Z') // 10:00 in Dhaka
  const base: PlanInput = {
    currency: 'BDT',
    grouping: 'south_asian',
    loans: [],
    lendings: [],
    recurring: [],
    nudge: { enabled: false, time: '21:00' },
    loggedToday: false,
    reminderIntervalDays: 3,
  }
  const plan = (o: Partial<PlanInput>) => planNotifications({ ...base, ...o }, NOW, 'Asia/Dhaka')

  it('EMI: day before and on the day at 10:00 local; past times dropped', () => {
    const out = plan({ loans: [{ id: 'l1', name: 'Home loan', nextDueDate: '2026-10-10', emi_amount_minor: 1500000 }] })
    expect(out.map((n) => [n.id, n.fireAt.toISOString()])).toEqual([
      ['emi:l1:2026-10-09', '2026-10-09T04:00:00.000Z'],
      ['emi:l1:2026-10-10', '2026-10-10T04:00:00.000Z'],
    ])
    expect(out[0]!.deepLink).toBe('/loan?id=l1')
    expect(out[1]!.body).toContain('BDT 15,000')
  })

  it('overdue EMI nags tomorrow morning', () => {
    const out = plan({ loans: [{ id: 'l1', name: 'Home loan', nextDueDate: '2026-10-01', emi_amount_minor: 1500000 }] })
    expect(out.map((n) => n.fireAt.toISOString())).toEqual(['2026-10-08T04:00:00.000Z'])
  })

  it('lending: due date then every N days until settled; no due date → nothing', () => {
    const out = plan({
      lendings: [
        { id: 'a', partyId: 'p1', name: 'Rafiq', direction: 'lent', outstanding: 1000000, due_on: '2026-10-08' },
        { id: 'b', partyId: 'p2', name: 'Karim', direction: 'lent', outstanding: 500000, due_on: null },
      ],
    })
    const days = out.map((n) => n.fireAt.toISOString().slice(0, 10))
    expect(days.slice(0, 3)).toEqual(['2026-10-08', '2026-10-11', '2026-10-14'])
    expect(out.every((n) => n.deepLink === '/person?id=p1')).toBe(true)
    expect(out[0]!.title).toContain('Rafiq')
  })

  it('daily nudge skips today when something was logged', () => {
    const notLogged = plan({ nudge: { enabled: true, time: '21:00' }, loggedToday: false }).filter((n) => n.kind === 'nudge')
    const logged = plan({ nudge: { enabled: true, time: '21:00' }, loggedToday: true }).filter((n) => n.kind === 'nudge')
    expect(notLogged[0]!.fireAt.toISOString()).toBe('2026-10-07T15:00:00.000Z')
    expect(logged[0]!.fireAt.toISOString()).toBe('2026-10-08T15:00:00.000Z')
  })

  it('caps at 64 keeping higher priority kinds first', () => {
    const out = plan({
      nudge: { enabled: true, time: '21:00' },
      lendings: Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, partyId: `p${i}`, name: `P${i}`, direction: 'lent' as const, outstanding: 100, due_on: '2026-10-08' })),
      loans: [{ id: 'l1', name: 'Loan', nextDueDate: '2026-10-10', emi_amount_minor: 100 }],
    })
    expect(out.length).toBe(64)
    expect(out.filter((n) => n.kind === 'emi')).toHaveLength(2)
    expect(out.some((n) => n.kind === 'nudge')).toBe(false)
  })
})
