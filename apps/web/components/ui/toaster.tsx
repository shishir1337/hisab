'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner } from 'sonner'

/** Bottom toasts with Undo actions (spec §7.3: undo instead of confirm dialogs). */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
      duration={5000}
      toastOptions={{
        style: { background: 'var(--text)', color: 'var(--page)', border: 'none', borderRadius: 14, fontSize: 13.5 },
        actionButtonStyle: { background: 'transparent', color: 'var(--page)', fontWeight: 700 },
      }}
    />
  )
}
