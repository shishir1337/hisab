'use client'

import { saveProfile } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { createContext, use, useCallback, useMemo, type ReactNode } from 'react'
import { useUserId } from '@/lib/powersync/provider'

interface Privacy {
  hidden: boolean
  toggle: () => void
}
const PrivacyContext = createContext<Privacy>({ hidden: false, toggle: () => {} })
/** "Hide amounts" (spec §8): masks every amount; persisted in the profile so it follows you across devices. */
export const usePrivacy = () => use(PrivacyContext)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const db = usePowerSync()
  const userId = useUserId()
  const { data } = useQuery<{ hide_amounts: number | null }>('select hide_amounts from profiles limit 1')
  const hidden = Boolean(data[0]?.hide_amounts)
  const toggle = useCallback(() => void saveProfile(db, userId, { hide_amounts: !hidden }), [db, userId, hidden])
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <PrivacyContext value={value}>{children}</PrivacyContext>
}
