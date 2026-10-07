'use client'

import { saveProfile } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { createContext, use, useCallback, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useUserId } from '@/lib/powersync/provider'

interface Privacy {
  hidden: boolean
  toggle: () => void
}
const PrivacyContext = createContext<Privacy>({ hidden: false, toggle: () => {} })
/** "Hide amounts" (spec §8): masks every amount; persisted in the profile so it follows you across devices. */
export const usePrivacy = () => use(PrivacyContext)

/** Text stand-in for an amount while amounts are hidden (toasts, sentences). */
export const MASK = '••••'

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const db = usePowerSync()
  const userId = useUserId()
  const { data } = useQuery<{ hide_amounts: number | null }>('select hide_amounts from profiles limit 1')
  const hidden = Boolean(data[0]?.hide_amounts)
  // Read the stored value, not the rendered one, so two quick clicks flip it twice.
  const toggle = useCallback(() => {
    void db
      .getOptional<{ hide_amounts: number | null }>('select hide_amounts from profiles where id = ?', [userId])
      .then((r) => saveProfile(db, userId, { hide_amounts: !r?.hide_amounts }))
      .catch(() => toast('Couldn’t change that. Please try again.'))
  }, [db, userId])
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <PrivacyContext value={value}>{children}</PrivacyContext>
}
