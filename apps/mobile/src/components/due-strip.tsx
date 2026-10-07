import { daysBetween } from '@hisab/core'
import { markEmiPaid, postOccurrence, softDeleteTransaction } from '@hisab/db'
import { usePowerSync } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { DueItem } from '@/features/plan/use-due'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'
import { Money } from './money'

/** Home "Due soon" strip (spec §7.3): ✓ records it, tapping the card opens it to adjust or skip. */
export function DueStrip({ items, today }: { items: DueItem[]; today: string }) {
  const { colors } = useTheme()
  if (items.length === 0) return null
  return (
    <View className="mt-6">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Due soon</Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push('/plan')}>
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>See all</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 18 }} style={{ marginRight: -18 }}>
        {items.map((item) => (
          <DueCard key={item.key} item={item} today={today} />
        ))}
      </ScrollView>
    </View>
  )
}

function whenLabel(date: string, today: string, overdue: boolean): string {
  const d = daysBetween(today, date)
  if (overdue) return `overdue ${-d}d`
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `in ${d} days`
}

function DueCard({ item, today }: { item: DueItem; today: string }) {
  const { colors } = useTheme()
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const toast = useToast()
  const busy = useRef(false)

  const title = item.kind === 'emi' ? item.loan.name : item.rule.note || item.rule.category_name || (item.rule.type === 'transfer' ? 'Transfer' : 'Recurring')
  const icon = item.kind === 'emi' ? '🏦' : (item.rule.category_icon ?? '🔁')
  const amount = item.kind === 'emi' ? item.loan.emi_amount_minor : item.rule.amount_minor
  const positive = item.kind === 'recurring' && item.rule.type === 'income'
  const canQuickRecord = item.kind === 'recurring' || Boolean(item.loan.default_account_id)

  const record = async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (item.kind === 'recurring') {
        const r = await postOccurrence(db, userId, item.rule, item.date, { occurred_on: item.date > today ? today : item.date })
        toast(r.created ? { message: `Recorded · ${title}`, onUndo: () => softDeleteTransaction(db, r.id) } : { message: 'Already recorded' })
      } else {
        const id = await markEmiPaid(db, userId, item.loan.id, { occurred_on: today })
        toast({ message: `EMI paid · ${title}`, onUndo: () => softDeleteTransaction(db, id) })
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t record it' })
    } finally {
      busy.current = false
    }
  }

  const open = () =>
    router.push(item.kind === 'emi' ? { pathname: '/loan', params: { id: item.loan.id } } : { pathname: '/due', params: { rule: item.rule.id, date: item.date } })

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${whenLabel(item.date, today, item.overdue)}`}
      onPress={open}
      className="w-[168px] rounded-card border border-border bg-surface p-3"
    >
      <View className="flex-row items-start justify-between">
        <Text numberOfLines={1} style={{ flex: 1, color: item.overdue ? colors.warning : colors.textMuted, fontSize: 11.5, fontWeight: item.overdue ? '600' : '500' }}>
          {item.overdue ? '● ' : ''}
          {icon} {title}
        </Text>
      </View>
      <View className="mt-1.5 flex-row items-end justify-between">
        <View className="flex-1">
          <Money minor={amount} currency={currency} grouping={grouping} size={15} weight="700" color={positive ? colors.positive : colors.text} />
          <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 2 }}>
            {item.kind === 'emi' ? `${item.progress.paid} of ${item.loan.total_installments} · ${whenLabel(item.date, today, item.overdue)}` : whenLabel(item.date, today, item.overdue)}
          </Text>
        </View>
        {canQuickRecord && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.kind === 'emi' ? 'Mark EMI paid' : 'Record'}
            hitSlop={8}
            onPress={() => void record()}
            className="h-9 w-9 items-center justify-center rounded-full bg-brand"
          >
            <Check size={17} color={colors.brandFg} strokeWidth={2.4} />
          </Pressable>
        )}
      </View>
      {item.kind === 'emi' && <ProgressBar ratio={item.progress.paid / item.loan.total_installments} />}
    </Pressable>
  )
}

export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
  const { colors } = useTheme()
  return (
    <View className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceMuted }}>
      <View style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, height: '100%', backgroundColor: color ?? colors.brand, borderRadius: 2 }} />
    </View>
  )
}

