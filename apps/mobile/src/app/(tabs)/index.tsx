import { addDays, balanceSeries, loanProgress } from '@hisab/core'
import { Q, QL, QP, type LoanWithPayments, type TransactionView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { router, useLocalSearchParams } from 'expo-router'
import { Wallet } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/button'
import { DueStrip } from '@/components/due-strip'
import { HeroCard } from '@/components/hero-card'
import { RemindersCard } from '@/components/reminders-card'
import { Money } from '@/components/money'
import { Screen } from '@/components/screen'
import { SyncPill } from '@/components/sync-pill'
import { TransactionRow } from '@/components/transaction-row'
import { useDueItems } from '@/features/plan/use-due'
import { useQuickLog } from '@/features/quick-log/provider'
import { useProfile, useToday } from '@/lib/profile'
import { useSession } from '@/lib/session'
import { useTheme } from '@/lib/theme'

const TREND_DAYS = 30


export default function HomeScreen() {
  const { currency, grouping, timeZone, onboardedAt, loaded } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const quickLog = useQuickLog()
  // The evening nudge notification links to "/?log=1": open quick log straight away.
  const { log } = useLocalSearchParams<{ log?: string }>()
  useEffect(() => {
    if (log === '1') {
      quickLog.open()
      router.setParams({ log: undefined })
    }
  }, [log, quickLog])

  const { data: accounts, isLoading } = useQuery<{ id: string }>(Q.activeAccounts)
  const { data: totalRows } = useQuery<{ total: number }>(Q.totalBalance)
  const { data: net } = useQuery<{ day: string; net: number }>(Q.dailyNet, [addDays(today, -TREND_DAYS)])
  const { data: todays } = useQuery<TransactionView>(Q.transactionsBetween, [today, today])

  const due = useDueItems(today, timeZone)
  const { data: loans } = useQuery<LoanWithPayments>(QP.loansWithPayments)
  const { data: lendingTotals } = useQuery<{ owed_to_me: number; i_owe: number }>(QL.lendingTotals)
  const loansLeft = loans.reduce((sum, l) => sum + loanProgress(l, l.paid_count, l.paid_amount, today).remainingAmount, 0)
  const total = totalRows[0]?.total ?? 0
  // First run: no accounts and never onboarded → the 2-minute setup.
  useEffect(() => {
    if (loaded && !isLoading && accounts.length === 0 && !onboardedAt) router.replace('/onboarding')
  }, [loaded, isLoading, accounts.length, onboardedAt])
  const series = useMemo(() => balanceSeries(total, net, today, TREND_DAYS).map((p) => p.balance), [total, net, today])
  const spentToday = todays.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_minor, 0)

  return (
    <Screen title="Home" accessory={<HeaderAccessory />}>
      {!isLoading && accounts.length === 0 ? (
        <FirstAccount />
      ) : (
        <HeroCard total={total} series={series} owedToYou={lendingTotals[0]?.owed_to_me ?? 0} loansLeft={loansLeft} currency={currency} grouping={grouping} />
      )}

      {accounts.length > 0 && <RemindersCard />}

      <DueStrip items={due} today={today} />

      <View className="mb-2 mt-6 flex-row items-baseline justify-between">
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Today</Text>
        {spentToday > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
            <Money minor={spentToday} currency={currency} grouping={grouping} size={12.5} weight="500" color={colors.textMuted} /> spent
          </Text>
        )}
      </View>

      {todays.length === 0 ? (
        <View className="items-center rounded-card border border-border bg-surface px-6 py-8">
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>Nothing logged today</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3, textAlign: 'center' }}>
            Every taka you track now saves a headache at month-end.
          </Text>
          {accounts.length > 0 && (
            <View className="mt-4 w-full">
              <Button variant="secondary" onPress={() => quickLog.open()}>
                Log an expense
              </Button>
            </View>
          )}
        </View>
      ) : (
        <View className="rounded-card border border-border bg-surface px-3.5">
          {todays.map((tx, i) => (
            <View key={tx.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
              <TransactionRow tx={tx} currency={currency} grouping={grouping} onPress={() => quickLog.open({ edit: tx })} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  )
}

function HeaderAccessory() {
  const { user } = useSession()
  const { colors } = useTheme()
  const initial = (user?.email ?? '?').charAt(0).toUpperCase()
  return (
    <View className="flex-row items-center gap-2">
      <SyncPill />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={8}
        onPress={() => router.push('/settings')}
        className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted"
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{initial}</Text>
      </Pressable>
    </View>
  )
}

function FirstAccount() {
  const { colors } = useTheme()
  return (
    <View className="rounded-hero border border-border bg-surface p-5">
      <View className="h-10 w-10 items-center justify-center rounded-tile bg-surface-muted">
        <Wallet size={20} color={colors.text} />
      </View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>Add your first account</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4 }}>
        Where your money sits — cash, a bank, bKash. Enter what’s in it right now and you’re set.
      </Text>
      <View className="mt-4">
        <Button onPress={() => router.push('/account')}>Add account</Button>
      </View>
    </View>
  )
}
