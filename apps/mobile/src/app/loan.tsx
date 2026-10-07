import { loanProgress, parseAmount } from '@hisab/core'
import { closeLoan, markEmiPaid, QP, softDeleteTransaction, type LoanWithPayments } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { Check, ChevronLeft, Pencil } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import { Button } from '@/components/button'
import { AmountField, formatDay } from '@/components/form'
import { Money } from '@/components/money'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

/** Loan detail (spec §7.3): months-left ring, paid / remaining, debt-free date, one-tap Mark paid. */
export default function LoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { data: loanRows } = useQuery<LoanWithPayments>(QP.loanById, [id])
  const { data: payments } = useQuery<{ id: string; amount_minor: number; installment_number: number; occurred_on: string; account_name: string | null }>(QP.loanPayments, [id])
  const [customAmount, setCustomAmount] = useState<string | null>(null)
  const busy = useRef(false)
  const loan = loanRows[0]
  if (!loan) return null

  const p = loanProgress(loan, loan.paid_count, loan.paid_amount, today)
  const ratio = p.paid / loan.total_installments

  const pay = async () => {
    if (busy.current) return
    busy.current = true
    try {
      let amount: number | undefined
      if (customAmount !== null) {
        const parsed = parseAmount(customAmount)
        if (!parsed.ok) return toast({ message: 'Enter the amount you paid' })
        amount = parsed.minor
      }
      const txId = await markEmiPaid(db, userId, loan.id, { occurred_on: today, amount_minor: amount })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast({ message: `EMI ${p.paid + 1} of ${loan.total_installments} paid`, onUndo: () => softDeleteTransaction(db, txId) })
      setCustomAmount(null)
    } catch (e) {
      if (e instanceof Error && /account/i.test(e.message)) router.push({ pathname: '/loan-form', params: { id: loan.id } })
      toast({ message: e instanceof Error ? e.message : 'Couldn’t record the EMI' })
    } finally {
      busy.current = false
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.page }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}>
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="-ml-2 h-11 w-11 items-center justify-center">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit loan" onPress={() => router.push({ pathname: '/loan-form', params: { id: loan.id } })} className="h-11 w-11 items-center justify-center">
          <Pencil size={18} color={colors.text} />
        </Pressable>
      </View>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
        {loan.name}
      </Text>
      <Text style={{ color: colors.textFaint, fontSize: 13, marginTop: 2 }}>
        {[loan.party_name, `EMI on the ${ordinal(Number(loan.first_due_date.slice(8)))}`, loan.default_account_name ? `from ${loan.default_account_name}` : null].filter(Boolean).join(' · ')}
      </Text>

      <View className="mt-5 items-center rounded-card border border-border bg-surface p-5">
        <Ring ratio={ratio} big={String(p.monthsLeft)} small={p.monthsLeft === 1 ? 'month left' : 'months left'} />
        <View className="mt-4 w-full flex-row">
          <Stat label="Paid" value={<Money minor={p.paidAmount} currency={currency} grouping={grouping} size={15} weight="700" color={colors.text} />} />
          <Stat label="Remaining" value={<Money minor={p.remainingAmount} currency={currency} grouping={grouping} size={15} weight="700" color={colors.text} />} />
        </View>
        {p.debtFreeBy && (
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>
            Debt-free by <Text style={{ color: colors.text, fontWeight: '700' }}>{formatDay(p.debtFreeBy).slice(-8)}</Text>
          </Text>
        )}
      </View>

      {p.nextDueDate ? (
        <View className="mt-3 rounded-card border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text style={{ color: p.isOverdue ? colors.warning : colors.textFaint, fontSize: 12, fontWeight: p.isOverdue ? '600' : '400' }}>
                {p.isOverdue ? `● Overdue · was due ${formatDay(p.nextDueDate)}` : `Next EMI · ${formatDay(p.nextDueDate)}`}
              </Text>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                EMI {p.paid + 1} of {loan.total_installments}
              </Text>
            </View>
            {customAmount === null && <Money minor={loan.emi_amount_minor} currency={currency} grouping={grouping} size={17} weight="700" color={colors.text} />}
          </View>
          {customAmount !== null && (
            <View className="mt-3">
              <AmountField value={customAmount} onChange={setCustomAmount} currency={currency} accessibilityLabel="Amount paid" />
            </View>
          )}
          <View className="mt-3 flex-row gap-2">
            <View className="flex-1">
              <Button onPress={() => void pay()}>
                <View className="flex-row items-center gap-2">
                  <Check size={18} color={colors.brandFg} strokeWidth={2.4} />
                  <Text style={{ color: colors.brandFg, fontSize: 15, fontWeight: '600' }}>Mark paid</Text>
                </View>
              </Button>
            </View>
            {customAmount === null && (
              <Button variant="secondary" onPress={() => setCustomAmount(String(loan.emi_amount_minor / 100))}>
                Other amount
              </Button>
            )}
          </View>
        </View>
      ) : (
        <View className="mt-3 rounded-card border border-border bg-surface p-4">
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>All EMIs paid 🎉</Text>
          <View className="mt-3">
            <Button
              variant="secondary"
              onPress={async () => {
                await closeLoan(db, loan.id, true)
                toast({ message: `${loan.name} closed`, onUndo: () => closeLoan(db, loan.id, false) })
                router.back()
              }}
            >
              Close this loan
            </Button>
          </View>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 }}>History</Text>
      <View className="rounded-card border border-border bg-surface px-3.5">
        {payments.length === 0 && (
          <Text style={{ color: colors.textFaint, fontSize: 13, paddingVertical: 14 }}>
            {loan.installments_paid_before > 0 ? `${loan.installments_paid_before} EMIs paid before Hisab.` : 'No EMIs recorded yet.'}
          </Text>
        )}
        {payments.map((pm, i) => (
          <View key={pm.id} className="flex-row items-center justify-between py-3" style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
            <View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>EMI {pm.installment_number}</Text>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                {formatDay(pm.occurred_on)}
                {pm.account_name ? ` · ${pm.account_name}` : ''}
              </Text>
            </View>
            <Money minor={pm.amount_minor} currency={currency} grouping={grouping} hideCode size={14} weight="600" color={colors.text} />
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function Ring({ ratio, big, small }: { ratio: number; big: string; small: string }) {
  const { colors } = useTheme()
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <Svg width={132} height={132} viewBox="0 0 132 132" accessibilityLabel={`${big} ${small}`}>
      <Circle cx={66} cy={66} r={r} fill="none" stroke={colors.surfaceMuted} strokeWidth={11} />
      <Circle
        cx={66}
        cy={66}
        r={r}
        fill="none"
        stroke={colors.brand}
        strokeWidth={11}
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.min(1, ratio))}
        transform="rotate(-90 66 66)"
      />
      <SvgText x={66} y={66} textAnchor="middle" fontSize={28} fontWeight="700" fill={colors.text}>
        {big}
      </SvgText>
      <SvgText x={66} y={86} textAnchor="middle" fontSize={11} fill={colors.textMuted}>
        {small}
      </SvgText>
    </Svg>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <View className="flex-1 items-center">
      <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{label}</Text>
      {value}
    </View>
  )
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
