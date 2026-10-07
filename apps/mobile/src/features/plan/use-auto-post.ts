import { localDate } from '@hisab/core'
import { postDueAutoRules } from '@hisab/db'
import { usePowerSync } from '@powersync/react'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useProfile, useToday } from '@/lib/profile'

/** Posts due "Record automatically" items on launch and whenever the app returns to the foreground (spec §6.5). */
export function useAutoPostRecurring() {
  const db = usePowerSync()
  const { userId, timeZone } = useProfile()
  const today = useToday(timeZone)

  useEffect(() => {
    if (!userId) return
    let running = false
    const run = async () => {
      if (running) return
      running = true
      try {
        await postDueAutoRules(db, userId, localDate(new Date(), timeZone), timeZone)
      } catch {
        // Retried on next foreground; a failure here must never block the app.
      } finally {
        running = false
      }
    }
    void run()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run()
    })
    return () => sub.remove()
    // `today` re-runs it after midnight while the app stays open.
  }, [db, userId, timeZone, today])
}
