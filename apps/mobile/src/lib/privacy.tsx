import { saveProfile } from '@hisab/db'
import { usePowerSync } from '@powersync/react'
import { createContext, use, useCallback, useMemo, type ReactNode } from 'react'
import { useProfile } from './profile'

interface Privacy {
  /** Amounts are masked everywhere (spec §8 "hide amounts"); persisted in the profile. */
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<Privacy>({ hidden: false, toggle: () => {} })
export const usePrivacy = () => use(PrivacyContext)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const db = usePowerSync()
  const { userId, hideAmounts } = useProfile()
  const toggle = useCallback(() => {
    if (userId) void saveProfile(db, userId, { hide_amounts: !hideAmounts })
  }, [db, userId, hideAmounts])
  const value = useMemo(() => ({ hidden: hideAmounts, toggle }), [hideAmounts, toggle])
  return <PrivacyContext value={value}>{children}</PrivacyContext>
}
