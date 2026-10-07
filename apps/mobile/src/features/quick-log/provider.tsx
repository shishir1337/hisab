import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import type { TransactionView } from '@hisab/db'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackHandler, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import type { QuickLogType } from '@hisab/db'
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
  const [visible, setVisible] = useState(false)
  const { colors, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()

  const open = useCallback((opts: OpenOptions = {}) => {
    setSession((s) => ({ key: s.key + 1, opts }))
    ref.current?.present()
  }, [])
  const close = useCallback(() => ref.current?.dismiss(), [])

  // Android back closes the sheet instead of navigating the screen underneath it.
  useEffect(() => {
    if (!visible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current?.dismiss()
      return true
    })
    return () => sub.remove()
  }, [visible])

  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={scheme === 'dark' ? 0.6 : 0.35} pressBehavior="close" />,
    [scheme],
  )
  const value = useMemo(() => ({ open }), [open])

  return (
    <QuickLogContext value={value}>
      {children}
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        // Never taller than the screen below the status bar, so Save is always reachable.
        maxDynamicContentSize={height - insets.top - 8}
        onChange={(i) => setVisible(i >= 0)}
        onDismiss={() => setVisible(false)}
        backdropComponent={backdrop}
        backgroundStyle={{ backgroundColor: colors.surface, borderRadius: 26, borderWidth: scheme === 'dark' ? 1 : 0, borderColor: colors.border }}
        handleIndicatorStyle={{ backgroundColor: scheme === 'dark' ? '#3A3B3F' : '#D9D9D4', width: 36, height: 4 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        accessibilityLabel="Quick log"
      >
        <BottomSheetScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
          <QuickLogSheet key={session.key} options={session.opts} onDone={close} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    </QuickLogContext>
  )
}
