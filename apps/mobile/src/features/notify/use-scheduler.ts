import { dueOccurrences, isoInstant, lendingStatus, loanProgress, localDate, planNotifications, type PlanInput } from '@hisab/core'
import { groupOccurrences, QL, QP, type LoanWithPayments, type OpenLending, type RecurringRuleView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect, useMemo } from 'react'
import { AppState } from 'react-native'
import { reconcile, setupNotificationChannel } from '@/lib/notifications'
import { usePrefs } from '@/lib/prefs'
import { useProfile, useToday } from '@/lib/profile'

const RECURRING_WINDOW_DAYS = 30

/** Re-plans device notifications whenever relevant data or prefs change, and on foreground (spec §6.8). */
export function useNotificationScheduler() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { prefs, ready } = usePrefs()
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  const { data: lendings } = useQuery<OpenLending>(QL.openLendings)
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const { data: todayCount } = useQuery<{ n: number }>('select count(*) as n from transactions where deleted_at is null and occurred_on = ?', [today])

  const input = useMemo<PlanInput>(() => {
    const postedBy = groupOccurrences(posted)
    const skippedBy = groupOccurrences(skipped)
    const recurring: PlanInput['recurring'] = []
    for (const r of rules) {
      if (r.mode !== 'confirm') continue
      const due = dueOccurrences(
        { ...r, created_on: localDate(new Date(isoInstant(r.created_at)), timeZone), paused: Boolean(r.paused_at) },
        postedBy.get(r.id) ?? new Set(),
        skippedBy.get(r.id) ?? new Set(),
        today,
        RECURRING_WINDOW_DAYS,
      )
      for (const d of due) if (d.date >= today) recurring.push({ key: `${r.id}:${d.date}`, title: r.note || r.category_name || 'Recurring item', date: d.date, amount_minor: r.amount_minor, type: r.type })
    }
    return {
      currency,
      grouping,
      loans: loans.map((l) => ({ id: l.id, name: l.name, emi_amount_minor: l.emi_amount_minor, nextDueDate: loanProgress(l, l.paid_count, l.paid_amount, today).nextDueDate })),
      lendings: lendings.map((l) => ({
        id: l.id,
        partyId: l.party_id,
        name: l.party_name,
        direction: l.direction,
        outstanding: lendingStatus(l, l.repaid, today).outstanding,
        due_on: l.due_on,
        intervalDays: l.reminder_interval_days,
      })),
      recurring,
      nudge: { enabled: prefs.nudgeEnabled, time: prefs.nudgeTime },
      loggedToday: (todayCount[0]?.n ?? 0) > 0,
      reminderIntervalDays: prefs.reminderIntervalDays,
    }
  }, [currency, grouping, loans, lendings, rules, posted, skipped, todayCount, prefs, today, timeZone])

  // Debounced reconcile on any change.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      void reconcile(planNotifications(input, new Date(), timeZone)).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [input, ready, timeZone])

  // Re-plan when the app comes back (e.g. a day boundary passed in the background).
  useEffect(() => {
    void setupNotificationChannel()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reconcile(planNotifications(input, new Date(), timeZone)).catch(() => {})
    })
    return () => sub.remove()
  }, [input, timeZone])

  // Tapping a notification opens its screen.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const link = r?.notification.request.content.data?.link
      if (typeof link === 'string') router.push(link as never)
    }
    void Notifications.getLastNotificationResponseAsync().then(open)
    const sub = Notifications.addNotificationResponseReceivedListener(open)
    return () => sub.remove()
  }, [])
}

