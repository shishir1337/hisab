import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import type { TransactionView } from '@hisab/db'
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import type { QuickLogType } from './form'
import { QuickLogSheet } from './sheet'

export interface OpenOptions {
  edit?: TransactionView
  type?: QuickLogType
}

const QuickLogContext = createContext<{ open: (o?: OpenOptions) => void }>({ open: () => {} })
/** Opens the quick-log sheet (new entry, or editing an existing transaction). */
export const useQuickLog = () => use(QuickLogContext)

export function QuickLogProvider({ children }: { children: ReactNode }) {
  const ref = useRef<BottomSheetModal>(null)
  const [session, setSession] = useState<{ key: number; opts: OpenOptions }>({ key: 0, opts: {} })
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const open = useCallback((opts: OpenOptions = {}) => {
    setSession((s) => ({ key: s.key + 1, opts }))
    ref.current?.present()
  }, [])
  const close = useCallback(() => ref.current?.dismiss(), [])

  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} />,
    [],
  )
  const value = useMemo(() => ({ open }), [open])

  return (
    <QuickLogContext value={value}>
      {children}
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backdropComponent={backdrop}
        backgroundStyle={{ backgroundColor: colors.surface, borderRadius: 26 }}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 36, height: 5 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
          <QuickLogSheet key={session.key} options={session.opts} onDone={close} />
        </BottomSheetView>
      </BottomSheetModal>
    </QuickLogContext>
  )
}
