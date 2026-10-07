import { addMonths, dayLabel, groupByDay, monthLabel, monthRange, totalEffect, type Grouping } from '@hisab/core'
import { Q, restoreTransaction, softDeleteTransaction, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Money } from '@/components/money'
import { TransactionRow } from '@/components/transaction-row'
import { useQuickLog } from '@/features/quick-log/provider'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

export default function ActivityScreen() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const [month, setMonth] = useState(() => monthRange(today).start)
  const { start, end } = monthRange(month)
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const quickLog = useQuickLog()
  const db = usePowerSync()
  const toast = useToast()

  const { data: rows } = useQuery<TransactionView>(Q.transactionsBetween, [start, end])
  const { data: summary } = useQuery<{ income: number; expense: number }>(Q.monthSummary, [start, end])
  const income = summary[0]?.income ?? 0
  const expense = summary[0]?.expense ?? 0

  const sections = useMemo(
    () =>
      groupByDay(rows).map((g) => ({
        day: g.day,
        net: g.rows.reduce((s, t) => s + totalEffect(t), 0),
        data: g.rows,
      })),
    [rows],
  )
  const isCurrentMonth = month === monthRange(today).start

  const remove = async (tx: TransactionView) => {
    await softDeleteTransaction(db, tx.id)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    toast({ message: 'Deleted', onUndo: () => restoreTransaction(db, tx.id) })
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(t) => t.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 140 }}
      ListHeaderComponent={
        <View className="mb-2">
          <View className="mb-4 flex-row items-center justify-between">
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
              Activity
            </Text>
            <View className="flex-row items-center gap-1">
              <StepButton label="Previous month" onPress={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft size={18} color={colors.text} />
              </StepButton>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600', minWidth: 74, textAlign: 'center' }}>{monthLabel(month)}</Text>
              <StepButton label="Next month" disabled={isCurrentMonth} onPress={() => setMonth(addMonths(month, 1))}>
                <ChevronRight size={18} color={isCurrentMonth ? colors.textFaint : colors.text} />
              </StepButton>
            </View>
          </View>
          <SummaryCard income={income} expense={expense} currency={currency} grouping={grouping} />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View className="mt-5 mb-1.5 flex-row items-baseline justify-between px-1">
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600' }}>{dayLabel(section.day, today)}</Text>
          {section.net !== 0 && (
            <Money minor={section.net} currency={currency} grouping={grouping} sign="always" hideCode size={12.5} weight="500" color={colors.textFaint} />
          )}
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <ReanimatedSwipeable
          friction={2}
          rightThreshold={60}
          overshootRight={false}
          renderRightActions={() => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete"
              onPress={() => void remove(item)}
              className="ml-2 w-20 items-center justify-center rounded-card"
              style={{ backgroundColor: colors.danger }}
            >
              <Trash2 size={20} color="#FFFFFF" />
            </Pressable>
          )}
          onSwipeableOpen={(direction) => {
            if (direction === 'left') void remove(item)
          }}
        >
          <View
            className="border-x border-border bg-surface px-3.5"
            style={{
              borderTopWidth: index === 0 ? 1 : 0,
              borderBottomWidth: index === section.data.length - 1 ? 1 : 0,
              borderTopLeftRadius: index === 0 ? 18 : 0,
              borderTopRightRadius: index === 0 ? 18 : 0,
              borderBottomLeftRadius: index === section.data.length - 1 ? 18 : 0,
              borderBottomRightRadius: index === section.data.length - 1 ? 18 : 0,
            }}
          >
            <View style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
              <TransactionRow tx={item} currency={currency} grouping={grouping} onPress={() => quickLog.open({ edit: item })} />
            </View>
          </View>
        </ReanimatedSwipeable>
      )}
      ListEmptyComponent={
        <View className="mt-4 items-center rounded-card border border-dashed border-border px-6 py-12">
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>No transactions in {monthLabel(month)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4, textAlign: 'center' }}>Tap + to log your first one.</Text>
        </View>
      }
    />
  )
}

function SummaryCard({ income, expense, currency, grouping }: { income: number; expense: number; currency: string; grouping: Grouping }) {
  const { colors } = useTheme()
  const cells = [
    ['In', income, colors.positive],
    ['Out', expense, colors.text],
    ['Net', income - expense, colors.text],
  ] as const
  return (
    <View className="flex-row rounded-card border border-border bg-surface p-4">
      {cells.map(([label, value, color], i) => (
        <View key={label} className="flex-1" style={i > 0 ? { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.borderSubtle } : undefined}>
          <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{label}</Text>
          <Money minor={value} currency={currency} grouping={grouping} size={15} weight="700" color={color} />
        </View>
      ))}
    </View>
  )
}

function StepButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-[10px] bg-surface-muted"
    >
      {children}
    </Pressable>
  )
}
