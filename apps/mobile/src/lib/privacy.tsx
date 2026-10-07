import { saveProfile } from '@hisab/db'
import { usePowerSync } from '@powersync/react'
import { createContext, use, useCallback, useMemo, type ReactNode } from 'react'
import { useProfile } from './profile'
import { useToast } from './undo'

interface Privacy {
  /** Amounts are masked everywhere (spec §8 "hide amounts"); persisted in the profile. */
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<Privacy>({ hidden: false, toggle: () => {} })
export const usePrivacy = () => use(PrivacyContext)

/** Text stand-in for an amount while amounts are hidden (toasts, notifications, sentences). */
export const MASK = '••••'

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const db = usePowerSync()
  const toast = useToast()
  const { userId, hideAmounts } = useProfile()
  const toggle = useCallback(() => {
    if (!userId) return
    // Read the stored value, not the rendered one, so two quick taps flip it twice.
    void db
      .getOptional<{ hide_amounts: number | null }>('select hide_amounts from profiles where id = ?', [userId])
      .then((r) => saveProfile(db, userId, { hide_amounts: !r?.hide_amounts }))
      .catch(() => toast({ message: 'Couldn’t change that. Please try again.' }))
  }, [db, userId, toast])
  const value = useMemo(() => ({ hidden: hideAmounts, toggle }), [hideAmounts, toggle])
  return <PrivacyContext value={value}>{children}</PrivacyContext>
}
