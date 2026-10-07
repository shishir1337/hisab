'use client'

import { localDate, type Grouping } from '@hisab/core'
import { Q } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { useEffect, useState } from 'react'
import { useUserId } from '@/lib/powersync/provider'
import { getSupabase } from '@/lib/supabase/client'

export interface Profile {
  userId: string
  currency: string
  grouping: Grouping
  timeZone: string
  displayName: string | null
}

/** Display preferences from the synced profile row, with defaults before the first sync. */
export function useProfile(): Profile {
  const userId = useUserId()
  const { data } = useQuery<{ base_currency: string | null; number_grouping: string | null; timezone: string | null; display_name: string | null }>(Q.profile)
  const p = data[0]
  return {
    userId,
    currency: p?.base_currency ?? 'BDT',
    grouping: (p?.number_grouping as Grouping | null) ?? 'south_asian',
    timeZone: p?.timezone ?? 'Asia/Dhaka',
    displayName: p?.display_name ?? null,
  }
}

/** Today's local date in the profile time zone; ticks over at midnight. */
export function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => localDate(new Date(), timeZone))
  useEffect(() => {
    const tick = () => setToday(localDate(new Date(), timeZone))
    tick()
    const t = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', tick)
    }
  }, [timeZone])
  return today
}

/** The signed-in email (read from the local session; no network). */
export function useUserEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => live && setEmail(data.session?.user.email ?? null))
    return () => {
      live = false
    }
  }, [])
  return email
}
