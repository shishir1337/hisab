import { addDays, budgetProgress, loanProgress, monthRange, occurrences, safeToSpendPerDay } from '@hisab/core'
import { groupOccurrences, pauseRecurringRule, QP, type BudgetWithSpent, type LoanWithPayments, type RecurringRuleView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { ChevronRight, Pause, Play, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ProgressBar } from '@/components/due-strip'
import { formatDay } from '@/components/form'
import { IconTile } from '@/components/icon-tile'
import { Money } from '@/components/money'
import { Screen } from '@/components/screen'
import { Segmented } from '@/components/segmented'
import { useProfile, useToday } from '@/lib/profile'
import { cadence } from '@/features/plan/format'
import { useTheme } from '@/lib/theme'

type Section = 'budgets' | 'recurring' | 'loans'

export default function PlanScreen() {
  const [section, setSection] = useState<Section>('budgets')
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
      <View className="mt-4">{section === 'budgets' ? <Budgets /> : section === 'recurring' ? <Recurring /> : <Loans />}</View>
    </Screen>
  )
}

// ---------------------------------------------------------------- budgets

function Budgets() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { start, end } = monthRange(today)
  const { colors } = useTheme()
  const { data } = useQuery<BudgetWithSpent>(QP.budgetsWithSpent, [start, end])
  const overall = data.find((b) => !b.category_id)
  const categories = data.filter((b) => b.category_id)
  const daysLeft = Number(end.slice(8)) - Number(today.slice(8)) + 1

  return (
    <View className="gap-3">
      {overall ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/budget', params: { category: '' } })} className="rounded-card border border-border bg-surface p-4">
          <View className="flex-row justify-between">
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>This month · {daysLeft} days left</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>{Math.round(budgetProgress(overall.spent, overall.amount_minor).ratio * 100)}% used</Text>
          </View>
          <View className="mt-1 flex-row items-baseline gap-1.5">
            <Money minor={overall.spent} currency={currency} grouping={grouping} size={20} weight="700" color={colors.text} />
            <Text style={{ color: colors.textFaint, fontSize: 13 }}>
              of <Money minor={overall.amount_minor} currency={currency} grouping={grouping} hideCode size={13} weight="500" color={colors.textFaint} />
            </Text>
          </View>
          <BudgetBar spent={overall.spent} limit={overall.amount_minor} />
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 8 }}>
            Safe to spend:{' '}
            <Money minor={safeToSpendPerDay(overall.amount_minor, overall.spent, today)} currency={currency} grouping={grouping} size={12.5} weight="700" color={colors.text} />
            /day
          </Text>
        </Pressable>
      ) : (
        <AddCard label="Set a monthly budget" hint="One number for everything you spend — see what’s safe to spend each day." onPress={() => router.push({ pathname: '/budget', params: { category: '' } })} />
      )}

      {categories.length > 0 && (
        <View className="rounded-card border border-border bg-surface px-3.5 py-1">
          {categories.map((b, i) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/budget', params: { category: b.category_id! } })}
              className="py-3"
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <IconTile icon={b.category_icon} tint={b.category_color} size={28} />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{b.category_name}</Text>
                </View>
                <Text style={{ color: budgetProgress(b.spent, b.amount_minor).state === 'over' ? colors.danger : colors.textMuted, fontSize: 12.5 }}>
                  <Money minor={b.spent} currency={currency} grouping={grouping} hideCode size={12.5} weight="600" color={budgetProgress(b.spent, b.amount_minor).state === 'over' ? colors.danger : colors.text} />
                  {' / '}
                  <Money minor={b.amount_minor} currency={currency} grouping={grouping} hideCode size={12.5} weight="500" color={colors.textFaint} />
                </Text>
              </View>
              <BudgetBar spent={b.spent} limit={b.amount_minor} />
            </Pressable>
          ))}
        </View>
      )}
      <AddRow label="Budget a category" onPress={() => router.push('/budget')} />
    </View>
  )
}

function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const { colors } = useTheme()
  const { ratio, state } = budgetProgress(spent, limit)
  return <ProgressBar ratio={ratio} color={state === 'over' ? colors.danger : state === 'near' ? colors.warning : colors.brand} />
}

// ---------------------------------------------------------------- recurring

function Recurring() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const db = usePowerSync()
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
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

  return (
    <View className="gap-3">
      {rules.length === 0 && (
        <AddCard label="Add your salary or rent" hint="Things that repeat show up as due on Home — record them with one tap." onPress={() => router.push('/recurring')} />
      )}
      {rules.length > 0 && (
        <View className="rounded-card border border-border bg-surface px-3.5">
          {rules.map((r, i) => {
            const next = nextFor(r)
            const positive = r.type === 'income'
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/recurring', params: { id: r.id } })}
                className="flex-row items-center py-3"
                style={[i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle }, r.paused_at ? { opacity: 0.5 } : null]}
              >
                <IconTile icon={r.category_icon ?? '🔁'} tint={r.category_color} />
                <View className="ml-3 flex-1">
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>
                    {r.note || r.category_name || `${r.account_name} → ${r.to_account_name}`}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12 }}>
                    {cadence(r)} · {r.paused_at ? 'Paused' : next ? `next ${formatDay(next)}` : 'Ended'}
                    {r.mode === 'auto' ? ' · Auto' : ''}
                  </Text>
                </View>
                <Money minor={positive ? r.amount_minor : -r.amount_minor} currency={currency} grouping={grouping} sign={r.type === 'transfer' ? 'never' : 'always'} hideCode size={14} weight="600" color={positive ? colors.positive : colors.text} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={r.paused_at ? 'Resume' : 'Pause'}
                  hitSlop={8}
                  onPress={() => void pauseRecurringRule(db, r.id, !r.paused_at, today)}
                  className="ml-2 h-9 w-9 items-center justify-center rounded-full bg-surface-muted"
                >
                  {r.paused_at ? <Play size={14} color={colors.text} /> : <Pause size={14} color={colors.text} />}
                </Pressable>
              </Pressable>
            )
          })}
        </View>
      )}
      {rules.length > 0 && <AddRow label="Add recurring item" onPress={() => router.push('/recurring')} />}
    </View>
  )
}

// ---------------------------------------------------------------- loans

function Loans() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)

  return (
    <View className="gap-3">
      {loans.length === 0 && <AddCard label="Add a loan you’re paying" hint="See months left, amount left and your debt-free date." onPress={() => router.push('/loan-form')} />}
      {loans.map((l) => {
        const p = loanProgress(l, l.paid_count, l.paid_amount, today)
        return (
          <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/loan', params: { id: l.id } })} className="rounded-card border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>🏦 {l.name}</Text>
              <ChevronRight size={16} color={colors.textFaint} />
            </View>
            <View className="mt-2 flex-row items-end justify-between">
              <View>
                <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>Remaining</Text>
                <Money minor={p.remainingAmount} currency={currency} grouping={grouping} size={18} weight="700" color={colors.text} />
              </View>
              <Text style={{ color: p.isOverdue ? colors.warning : colors.textMuted, fontSize: 12.5, fontWeight: p.isOverdue ? '600' : '400' }}>
                {p.monthsLeft === 0 ? 'Paid off 🎉' : p.isOverdue ? `● EMI overdue since ${formatDay(p.nextDueDate!)}` : `Next ${formatDay(p.nextDueDate!)}`}
              </Text>
            </View>
            <ProgressBar ratio={p.paid / l.total_installments} />
            <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 6 }}>
              {p.paid} of {l.total_installments} paid · {p.monthsLeft} left{p.debtFreeBy ? ` · debt-free by ${formatDay(p.debtFreeBy).slice(-8)}` : ''}
            </Text>
          </Pressable>
        )
      })}
      {loans.length > 0 && <AddRow label="Add loan" onPress={() => router.push('/loan-form')} />}
    </View>
  )
}

// ---------------------------------------------------------------- shared

function AddCard({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="rounded-card border border-dashed border-border p-5">
      <View className="h-9 w-9 items-center justify-center rounded-tile bg-surface-muted">
        <Plus size={18} color={colors.text} />
      </View>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 10 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{hint}</Text>
    </Pressable>
  )
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="h-11 flex-row items-center gap-2 self-start px-1">
      <Plus size={16} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

