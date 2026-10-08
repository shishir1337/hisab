import { addMonths, dayLabel, monthLabel, monthRange, totalEffect, type Grouping } from '@hisab/core'
import { createTransaction, Q, restoreTransaction, softDeleteTransaction, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, Copy, Pencil, Search, SearchX, Trash2, UserRound, X } from 'lucide-react-native'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Animated, ScrollView, Text, TextInput, View } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import Reanimated, { interpolate, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { LedgerArt } from '@/components/illustrations'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { CollapsingBar, EmptyState, GUTTER, LargeTitle, TAB_SCREEN_BOTTOM, useCollapsingHeader } from '@/components/screen'
import { RowPresence, useArrivals, type RowPresenceHandle } from '@/components/list-motion'
import { RowMenu, type RowMenuItem } from '@/components/row-menu'
import { Bone, RowsSkeleton, SkeletonGroup } from '@/components/skeleton'
import { TransactionRow, txTitle } from '@/components/transaction-row'
import { haptic } from '@/lib/motion'
import { useQuickLog } from '@/features/quick-log/provider'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

type Filter = 'all' | 'expense' | 'income' | 'transfer' | 'people' | 'emi'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Spending' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'people', label: 'Lending' },
  { value: 'emi', label: 'EMI' },
]
const EDITABLE = new Set<TransactionView['type']>(['expense', 'income', 'transfer'])

function matches(t: TransactionView, f: Filter) {
  if (f === 'all') return true
  if (f === 'people') return t.type === 'lending_in' || t.type === 'lending_out'
  return t.type === f
}

export default function ActivityScreen() {
  const { currency, grouping, timeZone, userId } = useProfile()
  const today = useToday(timeZone)
  const [month, setMonth] = useState(() => monthRange(today).start)
  const { start, end } = monthRange(month)
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const quickLog = useQuickLog()
  const db = usePowerSync()
  const toast = useToast()
  const header = useCollapsingHeader()

  const { data: rows, isLoading } = useQuery<TransactionView>(Q.transactionsBetween, [start, end])
  const { data: summary } = useQuery<{ income: number; expense: number }>(Q.monthSummary, [start, end])
  const income = summary[0]?.income ?? 0
  const expense = summary[0]?.expense ?? 0

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const filtering = filter !== 'all' || q.trim() !== ''

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { day: string; net: number; data: TransactionView[] }[] = []
    for (const t of rows) {
      if (!matches(t, filter)) continue
      if (needle && ![t.note, t.category_name, t.account_name, t.to_account_name, t.party_name].some((v) => v?.toLowerCase().includes(needle))) continue
      const last = out[out.length - 1]
      if (last && last.day === t.occurred_on) {
        last.data.push(t)
        last.net += totalEffect(t)
      } else out.push({ day: t.occurred_on, net: totalEffect(t), data: [t] })
    }
    return out
  }, [rows, q, filter])
  const shownCount = sections.reduce((n, s) => n + s.data.length, 0)
  const isCurrentMonth = month === monthRange(today).start

  // Rows register here so a delete (swipe, button or menu) can fold the row away before it goes.
  const rowRefs = useRef(new Map<string, RowPresenceHandle>())
  const ids = useMemo(() => rows.map((r) => r.id), [rows])
  const fresh = useArrivals(ids, `${start}|${filter}|${q.trim()}`)
  const [menu, setMenu] = useState<{ tx: TransactionView; at: { x: number; y: number } } | null>(null)

  const remove = useCallback(
    (tx: TransactionView) => {
      // The toast shows at once; the write lands after the row has folded away. Undo waits for it.
      let settle: (ok: boolean) => void = () => {}
      const deleted = new Promise<boolean>((r) => (settle = r))
      toast({
        message: `Deleted · ${txTitle(tx)}`,
        onUndo: async () => {
          if (await deleted) await restoreTransaction(db, tx.id)
        },
      })
      const del = async () => {
        try {
          await softDeleteTransaction(db, tx.id)
          settle(true)
        } catch {
          settle(false)
          rowRefs.current.get(tx.id)?.expand()
          toast({ message: 'Couldn’t delete it. Please try again.', kind: 'error' })
        }
      }
      const row = rowRefs.current.get(tx.id)
      if (row) row.collapse(() => void del())
      else void del()
    },
    [db, toast],
  )
  const duplicate = async (tx: TransactionView) => {
    try {
      const id = await createTransaction(db, userId, {
        type: tx.type,
        amount_minor: tx.amount_minor,
        account_id: tx.account_id,
        to_account_id: tx.to_account_id,
        category_id: tx.category_id,
        party_id: tx.party_id,
        note: tx.note,
        original_amount_minor: tx.original_amount_minor,
        original_currency: tx.original_currency,
        fx_rate: tx.fx_rate,
        occurred_on: today,
        occurred_at: new Date().toISOString(),
      })
      toast({ message: `Logged again today · ${txTitle(tx)}`, kind: 'success', onUndo: () => softDeleteTransaction(db, id) })
    } catch {
      toast({ message: 'Couldn’t duplicate it. Please try again.', kind: 'error' })
    }
  }
  const menuItems = (tx: TransactionView): RowMenuItem[] =>
    EDITABLE.has(tx.type)
      ? [
          { label: 'Edit', icon: Pencil, onPress: () => quickLog.open({ edit: tx }) },
          { label: 'Duplicate to today', icon: Copy, onPress: () => void duplicate(tx) },
          { label: 'Delete', icon: Trash2, danger: true, onPress: () => remove(tx) },
        ]
      : [
          ...(tx.party_id ? [{ label: 'Open person', icon: UserRound, onPress: () => router.push({ pathname: '/person', params: { id: tx.party_id! } }) }] : []),
          { label: 'Delete', icon: Trash2, danger: true, onPress: () => remove(tx) },
        ]
  const open = (tx: TransactionView) =>
    EDITABLE.has(tx.type) ? () => quickLog.open({ edit: tx }) : tx.party_id ? () => router.push({ pathname: '/person', params: { id: tx.party_id! } }) : undefined
  const clearFilters = () => {
    setQ('')
    setFilter('all')
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: GUTTER, paddingBottom: TAB_SCREEN_BOTTOM }}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            <LargeTitle
              title="Activity"
              accessory={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <StepButton label="Previous month" onPress={() => setMonth(addMonths(month, -1))}>
                    <ChevronLeft size={18} color={colors.text} />
                  </StepButton>
                  <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 14, fontWeight: '600', minWidth: 76, textAlign: 'center' }}>
                    {monthLabel(month)}
                  </Text>
                  <StepButton label="Next month" disabled={isCurrentMonth} onPress={() => setMonth(addMonths(month, 1))}>
                    <ChevronRight size={18} color={isCurrentMonth ? colors.textFaint : colors.text} />
                  </StepButton>
                </View>
              }
            />
            <SummaryCard income={income} expense={expense} currency={currency} grouping={grouping} />

            <View
              style={{
                marginTop: 14,
                height: 46,
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingLeft: 14,
                paddingRight: 4,
              }}
            >
              <Search size={17} color={colors.textFaint} />
              <TextInput
                accessibilityLabel="Search"
                value={q}
                onChangeText={setQ}
                placeholder="Search notes, categories, people…"
                placeholderTextColor={colors.textFaint}
                returnKeyType="search"
                style={{ flex: 1, height: '100%', marginLeft: 10, color: colors.text, fontSize: 15 }}
              />
              {q ? (
                <Press accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} color={colors.textMuted} />
                </Press>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: 10, marginHorizontal: -GUTTER }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 2 }}
            >
              {FILTERS.map((f) => (
                <Chip key={f.value} size="sm" label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
              ))}
            </ScrollView>
            {filtering && rows.length > 0 && (
              <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 10 }}>
                {shownCount} of {rows.length} in {monthLabel(month)}
              </Text>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ marginTop: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>{dayLabel(section.day, today)}</Text>
            {section.net !== 0 && (
              <Money minor={section.net} currency={currency} grouping={grouping} sign="always" hideCode size={13} weight="500" color={colors.textFaint} />
            )}
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0
          const last = index === section.data.length - 1
          return (
            <RowPresence
              appear={fresh.has(item.id)}
              ref={(h) => {
                if (h) rowRefs.current.set(item.id, h)
                else rowRefs.current.delete(item.id)
              }}
            >
              <ReanimatedSwipeable
                friction={1.6}
                rightThreshold={56}
                overshootRight={false}
                // Rows are separate views; the container's surface fill hides a subpixel seam between them.
                containerStyle={first ? undefined : { marginTop: -1, paddingTop: 1, backgroundColor: colors.surface, borderBottomLeftRadius: last ? 18 : 0, borderBottomRightRadius: last ? 18 : 0 }}
                renderRightActions={(progress) => <DeleteAction progress={progress} first={first} last={last} onPress={() => remove(item)} />}
                onSwipeableOpen={(direction) => {
                  if (direction === 'left') remove(item)
                }}
              >
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderTopWidth: first ? 1 : 0,
                    borderBottomWidth: last ? 1 : 0,
                    borderTopLeftRadius: first ? 18 : 0,
                    borderTopRightRadius: first ? 18 : 0,
                    borderBottomLeftRadius: last ? 18 : 0,
                    borderBottomRightRadius: last ? 18 : 0,
                    paddingHorizontal: 14,
                  }}
                >
                  {!first && <View style={{ height: 1, marginLeft: 52, backgroundColor: colors.borderSubtle }} />}
                  <TransactionRow
                    tx={item}
                    currency={currency}
                    grouping={grouping}
                    onPress={open(item)}
                    onLongPress={(at) => {
                      haptic.medium()
                      setMenu({ tx: item, at })
                    }}
                  />
                </View>
              </ReanimatedSwipeable>
            </RowPresence>
          )
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ marginTop: 22 }}>
              <SkeletonGroup>
                <Bone width={90} height={12} radius={6} style={{ marginBottom: 12, marginLeft: 2 }} />
                <RowsSkeleton count={6} />
              </SkeletonGroup>
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              {rows.length > 0 ? (
                <EmptyState
                  icon={<SearchX size={20} color={colors.textMuted} />}
                  title="Nothing matches"
                  description="Try a different word or filter."
                  action={
                    <Button variant="secondary" onPress={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  art={<LedgerArt />}
                  title={`No transactions in ${monthLabel(month)}`}
                  description={isCurrentMonth ? 'Log what you spend as it happens — it takes a few seconds.' : 'Nothing was logged this month.'}
                  action={
                    isCurrentMonth ? (
                      <Button variant="secondary" onPress={() => quickLog.open()}>
                        Log an expense
                      </Button>
                    ) : (
                      <Button variant="secondary" onPress={() => setMonth(monthRange(today).start)}>
                        Back to this month
                      </Button>
                    )
                  }
                />
              )}
            </View>
          )
        }
      />
      <CollapsingBar title={`Activity · ${monthLabel(month)}`} {...header} />
      <RowMenu at={menu?.at ?? null} title={menu ? txTitle(menu.tx) : undefined} items={menu ? menuItems(menu.tx) : []} onClose={() => setMenu(null)} />
    </View>
  )
}

function SummaryCard({ income, expense, currency, grouping }: { income: number; expense: number; currency: string; grouping: Grouping }) {
  const { colors } = useTheme()
  const net = income - expense
  const cells = [
    ['In', income, income > 0 ? colors.positive : colors.text],
    ['Out', expense, colors.text],
    ['Net', net, colors.text],
  ] as const
  return (
    <View style={{ flexDirection: 'row', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 14 }}>
      {cells.map(([label, value, color], i) => (
        <View key={label} style={[{ flex: 1, paddingHorizontal: 14 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.borderSubtle }]}>
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>{label}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ marginTop: 3 }}>
            <Money minor={value} currency={currency} grouping={grouping} size={16} weight="600" color={color} />
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Swipe-to-delete action: the bin grows in as the row is pulled, with a tick once letting go will delete. */
function DeleteAction({ progress, onPress, first, last }: { progress: SharedValue<number>; onPress: () => void; first: boolean; last: boolean }) {
  const { colors } = useTheme()
  useAnimatedReaction(
    () => progress.value > 0.7,
    (armed, was) => {
      if (armed && was === false) scheduleOnRN(haptic.selection)
    },
  )
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.15, 0.6], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0.15, 0.7, 1], [0.6, 1, 1.06], 'clamp') }],
  }))
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Delete"
      onPress={onPress}
      feedback="soft"
      style={{
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.danger,
        borderTopRightRadius: first ? 18 : 0,
        borderBottomRightRadius: last ? 18 : 0,
      }}
    >
      <Reanimated.View style={[{ alignItems: 'center' }, icon]}>
        <Trash2 size={19} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '600', marginTop: 3 }}>Delete</Text>
      </Reanimated.View>
    </Press>
  )
}

function StepButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic="selection"
      hitSlop={4}
      onPress={onPress}
      feedback="scale"
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </Press>
  )
}
