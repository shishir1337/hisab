import type { PlannedNotification } from '@hisab/core'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

/** Device notifications: setup, permission, and reconciling the planner's output (spec §6.8). */

export const CHANNEL_ID = 'reminders'
const OWN_PREFIX = /^(emi|lend|rec|nudge):/

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
})

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    description: 'EMIs, money owed, recurring items and the daily nudge',
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export type PermissionState = 'granted' | 'denied' | 'undetermined'

export async function getPermission(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
}

export async function requestPermission(): Promise<PermissionState> {
  await setupNotificationChannel()
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted' ? 'granted' : 'denied'
}

/**
 * Makes the OS schedule match `plan`: cancels our stale notifications, (re)schedules missing or changed
 * ones. Identifiers are the planner ids, so unchanged reminders are left alone.
 */
export async function reconcile(plan: PlannedNotification[]): Promise<void> {
  if ((await getPermission()) !== 'granted') return
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const want = new Map(plan.map((n) => [n.id, n]))
  const have = new Map(scheduled.filter((s) => OWN_PREFIX.test(s.identifier)).map((s) => [s.identifier, s]))

  for (const [id, s] of have) {
    const target = want.get(id)
    const same = target && s.content.title === target.title && s.content.body === target.body
    if (!same) await Notifications.cancelScheduledNotificationAsync(id)
    else want.delete(id)
  }
  for (const n of want.values()) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { link: n.deepLink } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: CHANNEL_ID },
    })
  }
}

/** Shows a budget alert right away, at most once per (category, month, threshold). */
export async function notifyBudgetOnce(key: string, title: string, body: string): Promise<void> {
  const storageKey = `hisab.budgetAlert.${key}`
  if (await AsyncStorage.getItem(storageKey)) return
  await AsyncStorage.setItem(storageKey, '1')
  if ((await getPermission()) !== 'granted') return
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { link: '/plan' } },
    trigger: null,
  })
}
