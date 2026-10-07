import type { Grouping } from '@hisab/core'
import { localDate } from '@hisab/core'
import { Q, type ProfileRow } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useSession } from './session'

export interface Profile {
  userId: string
  currency: string
  grouping: Grouping
  timeZone: string
  displayName: string | null
  hideAmounts: boolean
  onboardedAt: string | null
  /** False until the local profile query has returned (row may still be absent before first sync). */
  loaded: boolean
}

/** The user's display preferences, with sensible defaults until the profile row has synced. */
export function useProfile(): Profile {
  const { user } = useSession()
  const { data, isLoading } = useQuery<ProfileRow>(Q.profile)
  const p = data[0]
  return {
    userId: user?.userId ?? '',
    currency: p?.base_currency ?? 'BDT',
    grouping: (p?.number_grouping as Grouping | null) ?? 'south_asian',
    timeZone: p?.timezone ?? 'Asia/Dhaka',
    displayName: p?.display_name ?? null,
    hideAmounts: Boolean(p?.hide_amounts),
    onboardedAt: p?.onboarded_at ?? null,
    loaded: !isLoading,
  }
}

/** Today's local date; re-evaluated when the app returns to the foreground (e.g. after midnight). */
export function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => localDate(new Date(), timeZone))
  useEffect(() => {
    setToday(localDate(new Date(), timeZone))
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(localDate(new Date(), timeZone))
    })
    const t = setInterval(() => setToday(localDate(new Date(), timeZone)), 60_000)
    return () => {
      sub.remove()
      clearInterval(t)
    }
  }, [timeZone])
  return today
}
