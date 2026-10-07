import { addDays, addMonths, dayLabel } from '@hisab/core'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Minus, Plus, X } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'

/** Modal form scaffold: title + close, scrollable body, keyboard-aware. */
export function FormScreen({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled">
        <View className="mb-3 flex-row items-center justify-between">
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
            <X size={18} color={colors.text} />
          </Pressable>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export function Label({ children, hint }: { children: string; hint?: string }) {
  const { colors } = useTheme()
  return (
    <View className="mb-2 mt-5 flex-row items-baseline justify-between">
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>{children}</Text>
      {hint ? <Text style={{ color: colors.textFaint, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  )
}

export function TextField(props: { value: string; onChangeText: (v: string) => void; placeholder?: string; accessibilityLabel: string; maxLength?: number }) {
  const { colors } = useTheme()
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.textFaint}
      className="h-[52px] rounded-[14px] border border-border bg-surface px-4"
      style={{ color: colors.text, fontSize: 16 }}
    />
  )
}

/** Money input with the ISO code as a prefix; value is the raw typed string (parse with parseAmount). */
export function AmountField({ value, onChange, currency, accessibilityLabel }: { value: string; onChange: (v: string) => void; currency: string; accessibilityLabel: string }) {
  const { colors } = useTheme()
  return (
    <View className="h-[52px] flex-row items-center rounded-[14px] border border-border bg-surface px-4">
      <Text style={{ color: colors.textFaint, fontSize: 13, fontWeight: '500', marginRight: 8 }}>{currency}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, ''))}
        placeholder="0"
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}
      />
    </View>
  )
}

/** Date picker without a calendar popup: ‹ › by day, « » by month. */
export function DateStepper({ value, onChange, today }: { value: string; onChange: (d: string) => void; today: string }) {
  const { colors } = useTheme()
  const label = value === today || Math.abs(daysApart(value, today)) <= 1 ? dayLabel(value, today) : formatDay(value)
  return (
    <View className="h-[52px] flex-row items-center justify-between rounded-[14px] border border-border bg-surface px-1.5">
      <View className="flex-row">
        <StepIcon label="Previous month" onPress={() => onChange(addMonths(value, -1))}>
          <ChevronsLeft size={18} color={colors.textMuted} />
        </StepIcon>
        <StepIcon label="Previous day" onPress={() => onChange(addDays(value, -1))}>
          <ChevronLeft size={18} color={colors.text} />
        </StepIcon>
      </View>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      <View className="flex-row">
        <StepIcon label="Next day" onPress={() => onChange(addDays(value, 1))}>
          <ChevronRight size={18} color={colors.text} />
        </StepIcon>
        <StepIcon label="Next month" onPress={() => onChange(addMonths(value, 1))}>
          <ChevronsRight size={18} color={colors.textMuted} />
        </StepIcon>
      </View>
    </View>
  )
}

export function NumberStepper({ value, onChange, min = 0, max = 999, suffix }: { value: number; onChange: (n: number) => void; min?: number; max?: number; suffix?: string }) {
  const { colors } = useTheme()
  return (
    <View className="h-[52px] flex-row items-center justify-between rounded-[14px] border border-border bg-surface px-1.5">
      <StepIcon label="Decrease" onPress={() => onChange(Math.max(min, value - 1))}>
        <Minus size={18} color={value <= min ? colors.textFaint : colors.text} />
      </StepIcon>
      <TextInput
        accessibilityLabel="Value"
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(t) => {
          const n = Number(t.replace(/\D/g, ''))
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', minWidth: 60, fontVariant: ['tabular-nums'] }}
      />
      {suffix ? <Text style={{ color: colors.textFaint, fontSize: 13, position: 'absolute', right: 56 }}>{suffix}</Text> : null}
      <StepIcon label="Increase" onPress={() => onChange(Math.min(max, value + 1))}>
        <Plus size={18} color={value >= max ? colors.textFaint : colors.text} />
      </StepIcon>
    </View>
  )
}

function StepIcon({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} className="h-11 w-11 items-center justify-center rounded-[11px]">
      {children}
    </Pressable>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginTop: 12, marginBottom: 4, minHeight: 18 }}>
      {message ?? ''}
    </Text>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}
function daysApart(a: string, b: string) {
  return (Date.parse(a) - Date.parse(b)) / 86_400_000
}
