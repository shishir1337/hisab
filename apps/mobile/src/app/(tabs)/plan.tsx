import { addDays, budgetProgress, loanProgress, monthRange, occurrences, safeToSpendPerDay } from '@hisab/core'
import { groupOccurrences, pauseRecurringRule, QP, type BudgetWithSpent, type LoanWithPayments, type RecurringRuleView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { ChevronRight, Pause, Play, Plus } from 'lucide-react-native'
import { useMemo, useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { ProgressBar } from '@/components/due-strip'
import { monthYear, shortDay } from '@/components/form'
import { IconTile } from '@/components/icon-tile'
import { BudgetArt, LoanArt, PlanArt } from '@/components/illustrations'
import { useArrivals, useListMotion } from '@/components/list-motion'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { Divider, Screen } from '@/components/screen'
import { Segmented } from '@/components/segmented'
import { duration, easing, useMotion } from '@/lib/motion'
import { useProfile, useToday } from '@/lib/profile'
import { cadenceShort } from '@/features/plan/format'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

type Section = 'budgets' | 'recurring' | 'loans'

export default function PlanScreen() {
  const [section, setSection] = useState<Section>('budgets')
  const { reduced } = useMotion()
  return (
    <Screen title="Plan">
      <Segmented<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: 'budgets', label: 'Budgets' },
          { value: 'recurring', label: 'Recurring' },
          { value: 'loans', label: 'Loans' },
        ]}
      />
      {/* Switching sections cross-fades instead of snapping. */}
      <Animated.View key={section} entering={reduced ? undefined : FadeIn.duration(duration.base).easing(easing.out)} style={{ marginTop: 16 }}>
        {section === 'budgets' ? <Budgets /> : section === 'recurring' ? <Recurring /> : <Loans />}
      </Animated.View>
    </Screen>
  )
}

function useBudgetTone() {
  const { colors } = useTheme()
  return (state: ReturnType<typeof budgetProgress>['state']) => (state === 'over' ? colors.danger : state === 'near' ? colors.warning : colors.brand)
}

// ---------------------------------------------------------------- budgets

function Budgets() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { start, end } = monthRange(today)
  const { colors } = useTheme()
  const tone = useBudgetTone()
  const { data } = useQuery<BudgetWithSpent>(QP.budgetsWithSpent, [start, end])
  const overall = data.find((b) => !b.category_id)
  const categories = data.filter((b) => b.category_id)
  const motion = useListMotion()
  const arrived = useArrivals(useMemo(() => categories.map((b) => b.id), [data]), 'budgets')
  const daysLeft = Number(end.slice(8)) - Number(today.slice(8)) + 1

  const op = overall ? budgetProgress(overall.spent, overall.amount_minor) : null
  return (
    <View style={{ gap: 12 }}>
      {overall && op ? (
        <Press
          accessibilityRole="button"
          accessibilityHint="Edit the monthly budget"
          feedback="soft"
          onPress={() => router.push({ pathname: '/budget', params: { category: '' } })}
          style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>Monthly budget</Text>
            <Text style={{ color: op.state === 'over' ? colors.danger : op.state === 'near' ? colors.warning : colors.textFaint, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {op.state === 'over' ? 'Over · ' : ''}
              {Math.round(op.ratio * 100)}% used
            </Text>
          </View>
          <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Money minor={overall.spent} currency={currency} grouping={grouping} size={24} weight="700" color={op.state === 'over' ? colors.danger : colors.text} />
            <Text style={{ color: colors.textFaint, fontSize: 14 }}>
              of <Money minor={overall.amount_minor} currency={currency} grouping={grouping} hideCode size={14} weight="500" color={colors.textMuted} />
            </Text>
          </View>
          <ProgressBar ratio={op.ratio} color={tone(op.state)} />
          {/* Safe-to-spend callout (web): whole units per day — decimals here are noise. */}
          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 10 }}>
            <View>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>Safe to spend</Text>
              <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left this month
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              <Money minor={safeToSpendPerDay(overall.amount_minor, overall.spent, today)} currency={currency} grouping={grouping} showDecimals="never" size={18} weight="700" color={colors.text} />
              /day
            </Text>
          </View>
        </Press>
      ) : (
        <AddCard
          icon={<BudgetArt size={96} />}
          label="Set a monthly budget"
          hint="One number for everything you spend — see what’s safe to spend each day."
          onPress={() => router.push({ pathname: '/budget', params: { category: '' } })}
        />
      )}

      {categories.length > 0 && (
        <Animated.View layout={motion.layout} style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, overflow: 'hidden' }}>
          {categories.map((b, i) => {
            const p = budgetProgress(b.spent, b.amount_minor)
            return (
              <Animated.View key={b.id} entering={arrived.has(b.id) ? motion.entering : undefined} exiting={motion.exiting} layout={motion.layout}>
                {i > 0 && <Divider inset={48} />}
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`${b.category_name} budget, ${Math.round(p.ratio * 100)}% used`}
                  onPress={() => router.push({ pathname: '/budget', params: { category: b.category_id! } })}
                  style={{ paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start' }}
                >
                  <IconTile icon={b.category_icon} tint={b.category_color} size={36} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' }}>
                        {b.category_name}
                      </Text>
                      <Text style={{ color: p.state === 'over' ? colors.danger : p.state === 'near' ? colors.warning : colors.textFaint, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                        {p.state === 'over' ? 'Over · ' : ''}
                        {Math.round(p.ratio * 100)}%
                      </Text>
                    </View>
                    <ProgressBar ratio={p.ratio} color={tone(p.state)} height={5} />
                    <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 6 }}>
                      <Money minor={b.spent} currency={currency} grouping={grouping} hideCode size={12.5} weight="600" color={p.state === 'over' ? colors.danger : colors.textMuted} />
                      {' of '}
                      <Money minor={b.amount_minor} currency={currency} grouping={grouping} hideCode size={12.5} weight="500" color={colors.textFaint} />
                    </Text>
                  </View>
                </Press>
              </Animated.View>
            )
          })}
        </Animated.View>
      )}
      <AddRow label="Budget a category" onPress={() => router.push('/budget')} />
    </View>
  )
}

// ---------------------------------------------------------------- recurring

function Recurring() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const db = usePowerSync()
  const toast = useToast()
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const motion = useListMotion()
  const arrived = useArrivals(useMemo(() => rules.map((r) => r.id), [rules]), 'recurring')
  const { data: posted } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.postedOccurrences)
  const { data: skipped } = useQuery<{ rule_id: string; occurrence_date: string }>(QP.skippedOccurrences)
  const done = (() => {
    const p = groupOccurrences(posted)
    for (const [k, v] of groupOccurrences(skipped)) p.set(k, new Set([...(p.get(k) ?? []), ...v]))
    return p
  })()
  // Next unhandled occurrence: overdue ones count, already posted/skipped ones don't.
  const nextFor = (r: RecurringRuleView) => {
    if (r.paused_at) return null
    const from = [r.anchor_date, r.due_from ?? ''].reduce((a, b) => (b > a ? b : a))
    return occurrences(r, from, addDays(today, 800)).find((d) => !done.get(r.id)?.has(d)) ?? null
  }
  const togglePause = async (r: RecurringRuleView) => {
    const pause = !r.paused_at
    const name = r.note || r.category_name || 'Recurring item'
    // Toast at once; Undo waits for the write it reverses.
    const done = pauseRecurringRule(db, r.id, pause, today)
    toast({ message: pause ? `${name} paused` : `${name} resumed`, onUndo: async () => (await done, pauseRecurringRule(db, r.id, !pause, today)) })
    await done.catch(() => toast({ message: 'Couldn’t change that. Please try again.', kind: 'error' }))
  }

  if (rules.length === 0)
    return (
      <AddCard
        icon={<PlanArt size={96} />}
        label="Add your salary or rent"
        hint="Things that repeat show up as due on Home — record them with one tap."
        onPress={() => router.push('/recurring')}
      />
    )
  return (
    <View style={{ gap: 12 }}>
      <Animated.View layout={motion.layout} style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, overflow: 'hidden' }}>
        {rules.map((r, i) => {
          const next = nextFor(r)
          const positive = r.type === 'income'
          const paused = Boolean(r.paused_at)
          const overdue = next !== null && next < today
          const title = r.note || r.category_name || `${r.account_name} → ${r.to_account_name}`
          return (
            <Animated.View key={r.id} entering={arrived.has(r.id) ? motion.entering : undefined} exiting={motion.exiting} layout={motion.layout}>
              {i > 0 && <Divider inset={52} />}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Press
                  accessibilityRole="button"
                  accessibilityHint="Edit this recurring item"
                  onPress={() => router.push({ pathname: '/recurring', params: { id: r.id } })}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, opacity: paused ? 0.55 : 1 }}
                >
                  <IconTile icon={r.category_icon ?? '🔁'} tint={r.category_color} size={40} />
                  <View style={{ flex: 1, marginLeft: 12, marginRight: 10 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                      {title}
                    </Text>
                    <Text numberOfLines={1} style={{ color: overdue ? colors.danger : colors.textFaint, fontSize: 12.5, marginTop: 2, fontWeight: overdue ? '600' : '400' }}>
                      {paused ? 'Paused' : next ? `${overdue ? 'Overdue · ' : 'Next '}${shortDay(next, today)}` : 'Ended'} · {cadenceShort(r)}
                      {r.mode === 'auto' ? ' · Auto' : ''}
                    </Text>
                  </View>
                  <Money
                    minor={positive ? r.amount_minor : -r.amount_minor}
                    currency={currency}
                    grouping={grouping}
                    sign={r.type === 'transfer' ? 'never' : 'always'}
                    hideCode
                    size={15}
                    weight="600"
                    color={positive ? colors.positive : r.type === 'transfer' ? colors.textFaint : colors.text}
                  />
                </Press>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={paused ? `Resume ${title}` : `Pause ${title}`}
                  hitSlop={6}
                  feedback="scale"
                  onPress={() => void togglePause(r)}
                  style={{ marginLeft: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
                >
                  {paused ? <Play size={13} color={colors.text} fill={colors.text} /> : <Pause size={13} color={colors.textMuted} fill={colors.textMuted} />}
                </Press>
              </View>
            </Animated.View>
          )
        })}
      </Animated.View>
      <AddRow label="Add recurring item" onPress={() => router.push('/recurring')} />
    </View>
  )
}

// ---------------------------------------------------------------- loans

function Loans() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  const motion = useListMotion()
  const arrived = useArrivals(useMemo(() => loans.map((l) => l.id), [loans]), 'loans')

  if (loans.length === 0)
    return (
      <AddCard
        icon={<LoanArt size={96} />}
        label="Add a loan you’re paying"
        hint="See months left, amount left and your debt-free date."
        onPress={() => router.push('/loan-form')}
      />
    )
  return (
    <View style={{ gap: 12 }}>
      {loans.map((l) => {
        const p = loanProgress(l, l.paid_count, l.paid_amount, today)
        const done = p.monthsLeft === 0
        return (
          <Animated.View key={l.id} entering={arrived.has(l.id) ? motion.entering : undefined} exiting={motion.exiting} layout={motion.layout}>
          <Press

            accessibilityRole="button"
            accessibilityHint="Opens the loan"
            feedback="soft"
            onPress={() => router.push({ pathname: '/loan', params: { id: l.id } })}
            style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconTile icon="🏦" tint="slate" size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  {l.name}
                </Text>
                <Text numberOfLines={1} style={{ color: p.isOverdue ? colors.danger : colors.textFaint, fontSize: 12.5, marginTop: 2, fontWeight: p.isOverdue ? '600' : '400' }}>
                  {done ? 'All EMIs paid' : p.isOverdue ? `EMI overdue · since ${shortDay(p.nextDueDate!, today)}` : `Next EMI ${shortDay(p.nextDueDate!, today)}`}
                  {l.party_name ? ` · ${l.party_name}` : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} />
            </View>
            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>Remaining</Text>
                <Money minor={p.remainingAmount} currency={currency} grouping={grouping} size={20} weight="700" color={colors.text} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>EMI</Text>
                <Money minor={l.emi_amount_minor} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={colors.textMuted} />
              </View>
            </View>
            <ProgressBar ratio={p.paid / l.total_installments} color={done ? colors.positive : undefined} />
            <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 8, fontVariant: ['tabular-nums'] }}>
              {p.paid} of {l.total_installments} paid · {p.monthsLeft} left{p.debtFreeBy ? ` · debt-free by ${monthYear(p.debtFreeBy)}` : ''}
            </Text>
          </Press>
        </Animated.View>
        )
      })}
      <AddRow label="Add loan" onPress={() => router.push('/loan-form')} />
    </View>
  )
}

// ---------------------------------------------------------------- shared

function AddCard({ icon, label, hint, onPress }: { icon: ReactNode; label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      feedback="soft"
      onPress={onPress}
      style={{ borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textFaint + '66', backgroundColor: colors.surface, padding: 20 }}
    >
      {/* The art sits on its own soft disc; nudge it so the disc, not the canvas, lines up with the text. */}
      <View style={{ marginLeft: -10, marginTop: -6 }}>{icon}</View>
      <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '600', marginTop: 6 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 3, lineHeight: 19 }}>{hint}</Text>
      <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Plus size={16} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Add</Text>
      </View>
    </Press>
  )
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      onPress={onPress}
      feedback="soft"
      style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textFaint + '66' }}
    >
      <Plus size={17} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{label}</Text>
    </Press>
  )
}
