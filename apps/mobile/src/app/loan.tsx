import { loanProgress, parseAmount } from '@hisab/core'
import { closeLoan, markEmiPaid, QP, softDeleteTransaction, type LoanWithPayments } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { Check, Pencil } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import { Button } from '@/components/button'
import { AmountField, monthYear, shortDay } from '@/components/form'
import { Money } from '@/components/money'
import { BarButton, Divider, SectionHeader, StackScreen } from '@/components/screen'
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
  const toast = useToast()
  const { data: loanRows } = useQuery<LoanWithPayments>(QP.loanById, [id])
  const { data: payments } = useQuery<{ id: string; amount_minor: number; installment_number: number; occurred_on: string; account_name: string | null }>(QP.loanPayments, [id])
  const [customAmount, setCustomAmount] = useState<string | null>(null)
  const busy = useRef(false)
  const loan = loanRows[0]
  if (!loan) return <View style={{ flex: 1, backgroundColor: colors.page }} />

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
      toast({ message: 'EMI marked paid', onUndo: () => softDeleteTransaction(db, txId) })
      setCustomAmount(null)
    } catch (e) {
      if (e instanceof Error && /account/i.test(e.message)) router.push({ pathname: '/loan-form', params: { id: loan.id } })
      toast({ message: e instanceof Error ? e.message : 'Couldn’t record the EMI' })
    } finally {
      busy.current = false
    }
  }

  const card = { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface } as const
  return (
    <StackScreen
      title={loan.name}
      subtitle={[loan.party_name, `EMI on the ${ordinal(Number(loan.first_due_date.slice(8)))}`, loan.default_account_name ? `from ${loan.default_account_name}` : null].filter(Boolean).join(' · ')}
      actions={
        <BarButton label="Edit loan" onPress={() => router.push({ pathname: '/loan-form', params: { id: loan.id } })}>
          <Pencil size={19} color={colors.text} />
        </BarButton>
      }
    >
      <View style={{ ...card, alignItems: 'center', padding: 20 }}>
        <Ring ratio={ratio} big={String(p.monthsLeft)} small={p.monthsLeft === 1 ? 'month left' : 'months left'} />
        <View style={{ marginTop: 18, width: '100%', flexDirection: 'row' }}>
          <Stat label="Paid" value={<Money minor={p.paidAmount} currency={currency} grouping={grouping} size={16} weight="700" color={colors.text} />} />
          <Stat divider label="Remaining" value={<Money minor={p.remainingAmount} currency={currency} grouping={grouping} size={16} weight="700" color={colors.text} />} />
        </View>
        {p.debtFreeBy && (
          <View style={{ marginTop: 16, borderRadius: 999, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Debt-free by <Text style={{ color: colors.text, fontWeight: '700' }}>{monthYear(p.debtFreeBy)}</Text>
            </Text>
          </View>
        )}
      </View>

      {p.nextDueDate ? (
        <View style={{ ...card, marginTop: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.isOverdue ? colors.danger : colors.text, fontSize: 15, fontWeight: '600' }}>
                {p.isOverdue ? `Overdue · was due ${shortDay(p.nextDueDate, today)}` : `Next EMI · ${shortDay(p.nextDueDate, today)}`}
              </Text>
              <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>
                EMI {p.paid + 1} of {loan.total_installments}
              </Text>
            </View>
            {customAmount === null && <Money minor={loan.emi_amount_minor} currency={currency} grouping={grouping} size={18} weight="700" color={colors.text} />}
          </View>
          {customAmount !== null && (
            <View style={{ marginTop: 14 }}>
              <AmountField value={customAmount} onChange={setCustomAmount} currency={currency} accessibilityLabel="Amount paid" />
            </View>
          )}
          <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              {customAmount === null ? (
                <Button variant="secondary" onPress={() => setCustomAmount(String(loan.emi_amount_minor / 100))}>
                  Other amount
                </Button>
              ) : (
                <Button variant="secondary" onPress={() => setCustomAmount(null)}>
                  Cancel
                </Button>
              )}
            </View>
            <View style={{ flex: 1.4 }}>
              <Button onPress={() => void pay()} icon={<Check size={18} color={colors.brandFg} strokeWidth={2.4} />}>
                Mark paid
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ ...card, marginTop: 12, padding: 16 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>All EMIs paid</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Close the loan to move it out of Plan.</Text>
          <View style={{ marginTop: 14 }}>
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

      <SectionHeader title="History" right={payments.length ? <Text style={{ color: colors.textFaint, fontSize: 13 }}>{payments.length} recorded</Text> : undefined} />
      <View style={{ ...card, paddingHorizontal: 14 }}>
        {payments.length === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 13.5, paddingVertical: 16 }}>
            {loan.installments_paid_before > 0 ? `${loan.installments_paid_before} EMIs paid before Hisab.` : 'No EMIs recorded yet.'}
          </Text>
        )}
        {payments.map((pm, i) => (
          <View key={pm.id}>
            {i > 0 && <Divider />}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, paddingVertical: 12 }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>EMI {pm.installment_number}</Text>
                <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>
                  {shortDay(pm.occurred_on, today)}
                  {pm.account_name ? ` · ${pm.account_name}` : ''}
                </Text>
              </View>
              <Money minor={pm.amount_minor} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={colors.text} />
            </View>
          </View>
        ))}
      </View>
    </StackScreen>
  )
}

function Ring({ ratio, big, small }: { ratio: number; big: string; small: string }) {
  const { colors } = useTheme()
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <Svg width={132} height={132} viewBox="0 0 132 132" accessibilityLabel={`${big} ${small}`}>
      <Circle cx={66} cy={66} r={r} fill="none" stroke={colors.border} strokeWidth={11} />
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
      <SvgText x={66} y={70} textAnchor="middle" fontSize={30} fontWeight="700" fill={colors.text}>
        {big}
      </SvgText>
      <SvgText x={66} y={90} textAnchor="middle" fontSize={11.5} fill={colors.textMuted}>
        {small}
      </SvgText>
    </Svg>
  )
}

function Stat({ label, value, divider }: { label: string; value: React.ReactNode; divider?: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={[{ flex: 1, alignItems: 'center' }, divider && { borderLeftWidth: 1, borderLeftColor: colors.borderSubtle }]}>
      <Text style={{ color: colors.textFaint, fontSize: 12 }}>{label}</Text>
      <View style={{ marginTop: 2 }}>{value}</View>
    </View>
  )
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
