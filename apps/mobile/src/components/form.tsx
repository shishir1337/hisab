import { addDays, addMonths, dayLabel } from '@hisab/core'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Minus, Plus } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { ScrollView, Switch, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

import { GUTTER } from './screen'

export { FormScreen } from './screen'

/** Field height and radius shared by every input (web: h-11/12, 12–14px radius). */
const FIELD = { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 } as const

export function Label({ children, hint, first }: { children: string; hint?: string; first?: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={{ marginTop: first ? 8 : 22, marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>{children}</Text>
      {hint ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.textFaint, fontSize: 12.5 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

/** Border darkens while focused, like the web inputs' focus ring. */
function useFocusBorder() {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  return { borderColor: focused ? colors.textFaint : colors.border, onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
}

export function TextField(props: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  accessibilityLabel: string
  maxLength?: number
  keyboardType?: TextInputProps['keyboardType']
  autoCapitalize?: TextInputProps['autoCapitalize']
  onEndEditing?: () => void
  invalid?: boolean
}) {
  const { colors } = useTheme()
  const { invalid, ...rest } = props
  const focus = useFocusBorder()
  return (
    <TextInput
      {...rest}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      placeholderTextColor={colors.textFaint}
      style={{ ...FIELD, borderColor: invalid ? colors.danger : focus.borderColor, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }}
    />
  )
}

/** Money input with the ISO code as a prefix; value is the raw typed string (parse with parseAmount). */
export function AmountField({ value, onChange, currency, accessibilityLabel }: { value: string; onChange: (v: string) => void; currency: string; accessibilityLabel: string }) {
  const { colors } = useTheme()
  const focus = useFocusBorder()
  return (
    <View style={{ ...FIELD, borderColor: focus.borderColor, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ color: colors.textFaint, fontSize: 13, fontWeight: '600', letterSpacing: 0.3, marginRight: 10 }}>{currency}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, ''))}
        placeholder="0"
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        style={{ flex: 1, height: '100%', color: colors.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}
      />
    </View>
  )
}

/** Date picker without a calendar popup: ‹ › by day, « » by month. */
export function DateStepper({ value, onChange, today }: { value: string; onChange: (d: string) => void; today: string }) {
  const { colors } = useTheme()
  const label = value === today || Math.abs(daysApart(value, today)) <= 1 ? dayLabel(value, today) : formatDay(value)
  return (
    <View style={{ ...FIELD, paddingHorizontal: 4, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row' }}>
        <StepIcon label="Previous month" onPress={() => onChange(addMonths(value, -1))}>
          <ChevronsLeft size={18} color={colors.textFaint} />
        </StepIcon>
        <StepIcon label="Previous day" onPress={() => onChange(addDays(value, -1))}>
          <ChevronLeft size={19} color={colors.text} />
        </StepIcon>
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <StepIcon label="Next day" onPress={() => onChange(addDays(value, 1))}>
          <ChevronRight size={19} color={colors.text} />
        </StepIcon>
        <StepIcon label="Next month" onPress={() => onChange(addMonths(value, 1))}>
          <ChevronsRight size={18} color={colors.textFaint} />
        </StepIcon>
      </View>
    </View>
  )
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
  format,
  accessibilityLabel = 'Value',
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix?: string
  /** Show a formatted, read-only value (e.g. "9:00 PM") instead of an editable number. */
  format?: (n: number) => string
  accessibilityLabel?: string
}) {
  const { colors } = useTheme()
  return (
    <View style={{ ...FIELD, paddingHorizontal: 4, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <StepIcon label="Decrease" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))}>
        <Minus size={18} color={value <= min ? colors.textFaint : colors.text} />
      </StepIcon>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
        {format ? (
          <Text accessibilityLabel={`${accessibilityLabel}: ${format(value)}`} accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {format(value)}
          </Text>
        ) : (
        <TextInput
          accessibilityLabel={accessibilityLabel}
          keyboardType="number-pad"
          value={String(value)}
          selectTextOnFocus
          onChangeText={(t) => {
            const n = Number(t.replace(/\D/g, ''))
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          }}
          style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', minWidth: 36, padding: 0, fontVariant: ['tabular-nums'] }}
        />
        )}
        {suffix ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{suffix}</Text> : null}
      </View>
      <StepIcon label="Increase" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))}>
        <Plus size={18} color={value >= max ? colors.textFaint : colors.text} />
      </StepIcon>
    </View>
  )
}

function StepIcon({ label, onPress, children, disabled }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic="selection"
      onPress={onPress}
      hitSlop={2}
      feedback="none"
      pressedStyle={{ backgroundColor: colors.surfaceMuted }}
      style={{ width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Press>
  )
}

/** Label + help on the left, a switch on the right — inside a card. */
export function SwitchRow({ label, description, value, onValueChange }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors, scheme } = useTheme()
  return (
    <Press
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      feedback="none"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, paddingVertical: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{label}</Text>
        {description ? <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brand, false: scheme === 'dark' ? '#3A3B3F' : '#D9D9D4' }}
        thumbColor={value ? colors.brandFg : scheme === 'dark' ? colors.textMuted : '#FFFFFF'}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Press>
  )
}

/** A horizontally scrolling row of chips that runs to the screen edges instead of being cut at the gutter. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -GUTTER }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 2 }}
    >
      {children}
    </ScrollView>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginTop: 14, marginBottom: 6, minHeight: 18 }}>
      {message ?? ''}
    </Text>
  )
}

/** Quiet secondary/destructive action at the end of a form body (kept out of the pinned footer on purpose). */
export function FormLink({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ marginTop: 28, height: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 16, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: danger ? colors.danger : colors.textMuted, fontSize: 14.5, fontWeight: '600' }}>{label}</Text>
    </Press>
  )
}

/** Error shown just above a pinned form footer's button; takes no space when there's nothing to say. */
export function FooterError({ message }: { message: string | null }) {
  const { colors } = useTheme()
  if (!message) return null
  return (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>
      {message}
    </Text>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}
/** "12 Oct" — drops the year when it's the current one. */
export function shortDay(day: string, today: string): string {
  const d = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
  return day.slice(0, 4) === today.slice(0, 4) ? d : `${d} ${day.slice(0, 4)}`
}
/** "Mar 2027" */
export function monthYear(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}
function daysApart(a: string, b: string) {
  return (Date.parse(a) - Date.parse(b)) / 86_400_000
}
