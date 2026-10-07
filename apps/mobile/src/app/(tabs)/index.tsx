import { addDays, balanceSeries, loanProgress, localHour } from '@hisab/core'
import { Q, QL, QP, type LoanWithPayments, type TransactionView } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { router, useLocalSearchParams } from 'expo-router'
import { Sparkles, Wallet } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { DueStrip } from '@/components/due-strip'
import { HeroCard } from '@/components/hero-card'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { RemindersCard } from '@/components/reminders-card'
import { Divider, EmptyState, Screen, SectionHeader } from '@/components/screen'
import { SyncPill } from '@/components/sync-pill'
import { TransactionRow } from '@/components/transaction-row'
import { useDueItems } from '@/features/plan/use-due'
import { useQuickLog } from '@/features/quick-log/provider'
import { useDataReady } from '@/lib/powersync'
import { useProfile, useToday } from '@/lib/profile'
import { useSession } from '@/lib/session'
import { useTheme } from '@/lib/theme'

const TREND_DAYS = 30
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Thursday, 8 October" for a YYYY-MM-DD day. */
function longDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export default function HomeScreen() {
  const { currency, grouping, timeZone, onboardedAt, loaded, displayName } = useProfile()
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
  // First run: no accounts and never onboarded → the 2-minute setup. On a new phone the local database
  // starts empty, so wait for the first sync — an existing user must never be sent through setup again.
  const ready = useDataReady()
  const empty = ready && !isLoading && accounts.length === 0
  useEffect(() => {
    if (empty && loaded && !onboardedAt) router.replace('/onboarding')
  }, [empty, loaded, onboardedAt])
  const series = useMemo(() => balanceSeries(total, net, today, TREND_DAYS).map((p) => p.balance), [total, net, today])
  const spentToday = todays.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_minor, 0)

  const hour = localHour(new Date(), timeZone)
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = displayName?.trim().split(/\s+/)[0]

  return (
    <Screen
      title={first ? `${greeting}, ${first}` : greeting}
      compactTitle="Home"
      subtitle={longDate(today)}
      accessory={<HeaderAccessory />}
      compactAccessory={<SettingsButton size={34} />}
    >
      {!ready && accounts.length === 0 ? (
        <Downloading />
      ) : empty ? (
        <FirstAccount />
      ) : (
        <HeroCard total={total} series={series} owedToYou={lendingTotals[0]?.owed_to_me ?? 0} loansLeft={loansLeft} currency={currency} grouping={grouping} />
      )}

      <DueStrip items={due} today={today} />

      <SectionHeader
        title="Today"
        right={
          spentToday > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              <Money minor={spentToday} currency={currency} grouping={grouping} size={13} weight="600" color={colors.text} /> spent
            </Text>
          ) : undefined
        }
      />

      {todays.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={20} color={colors.textMuted} />}
          title="Nothing logged today"
          description={accounts.length > 0 ? 'Log what you spend as it happens — it takes a few seconds.' : 'Add an account first, then log what you spend.'}
          action={
            accounts.length > 0 ? (
              <Button variant="secondary" onPress={() => quickLog.open()}>
                Log an expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
          {todays.map((tx, i) => (
            <View key={tx.id}>
              {i > 0 && <Divider inset={52} />}
              <TransactionRow
                tx={tx}
                currency={currency}
                grouping={grouping}
                onPress={
                  tx.type === 'expense' || tx.type === 'income' || tx.type === 'transfer'
                    ? () => quickLog.open({ edit: tx })
                    : tx.party_id
                      ? () => router.push({ pathname: '/person', params: { id: tx.party_id! } })
                      : undefined
                }
              />
            </View>
          ))}
        </View>
      )}

      {accounts.length > 0 && <RemindersCard />}
    </Screen>
  )
}

function SettingsButton({ size = 40 }: { size?: number }) {
  const { user } = useSession()
  const { displayName } = useProfile()
  const { colors } = useTheme()
  const source = displayName?.trim() || user?.email || '?'
  const initials = displayName?.trim()
    ? source
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('')
    : source.charAt(0).toUpperCase()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={(48 - size) / 2}
      feedback="scale"
      onPress={() => router.push('/settings')}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <Text style={{ color: colors.text, fontSize: size * 0.36, fontWeight: '600' }}>{initials}</Text>
    </Press>
  )
}

function HeaderAccessory() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <SyncPill />
      <SettingsButton />
    </View>
  )
}

function Downloading() {
  const { colors } = useTheme()
  return (
    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Getting your data…</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
        Your accounts and history are downloading to this phone. Connect to the internet if this takes a while.
      </Text>
    </View>
  )
}

function FirstAccount() {
  const { colors } = useTheme()
  return (
    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
        <Wallet size={20} color={colors.text} />
      </View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 14 }}>Add your first account</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
        Where your money sits — cash, a bank, bKash. Enter what’s in it right now and you’re set.
      </Text>
      <View style={{ marginTop: 16 }}>
        <Button onPress={() => router.push('/account')}>Add account</Button>
      </View>
    </View>
  )
}
