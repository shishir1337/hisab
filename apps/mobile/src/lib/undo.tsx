import { tokens } from '@hisab/tokens'
import * as Haptics from 'expo-haptics'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from './theme'

interface Toast {
  id: number
  message: string
  onUndo?: () => void | Promise<void>
}

const UndoContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

/** Show a bottom toast; with `onUndo` it offers Undo for 5 s (spec §7.3, no confirm dialogs). */
export const useToast = () => use(UndoContext)

export function UndoProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    if (timer.current) clearTimeout(timer.current)
    const next = { ...t, id: Date.now() }
    setToast(next)
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === next.id ? null : cur)), tokens.motion.undoMs)
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return (
    <UndoContext value={show}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(tokens.motion.base)}
          exiting={FadeOutDown.duration(tokens.motion.fast)}
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 92 }}
        >
          <View
            accessibilityLiveRegion="polite"
            className="flex-row items-center justify-between rounded-[14px] px-4 py-3"
            style={{
              backgroundColor: colors.text,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            <Text numberOfLines={1} style={{ color: colors.page, fontSize: 13.5, flex: 1, marginRight: 12 }}>
              {toast.message}
            </Text>
            {toast.onUndo && (
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={async () => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setToast(null)
                  try {
                    await toast.onUndo?.()
                  } catch {
                    show({ message: 'Couldn’t undo. Please fix it manually.' })
                  }
                }}
              >
                <Text style={{ color: colors.page, fontSize: 13.5, fontWeight: '700' }}>Undo</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </UndoContext>
  )
}
