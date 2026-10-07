import { loanProgress, parseAmount } from '@hisab/core'
import { createLoan, createParty, Q, QP, updateLoan, ValidationError, type LoanWithPayments } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, DateStepper, ErrorLine, FormScreen, formatDay, Label, NumberStepper, TextField } from '@/components/form'
import { Money } from '@/components/money'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

/** Add / edit a fixed-EMI loan (spec §5.2 loans). */
export default function LoanFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const { data: loanRows } = useQuery<LoanWithPayments>(QP.loanById, [id ?? ''])
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const existing = id ? loanRows[0] : undefined

  const [name, setName] = useState('')
  const [lender, setLender] = useState('')
  const [emi, setEmi] = useState('')
  const [months, setMonths] = useState(12)
  const [firstDue, setFirstDue] = useState(today)
  const [paidBefore, setPaidBefore] = useState(0)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!existing || loaded.current) return
    loaded.current = true
    setName(existing.name)
    setLender(existing.party_name ?? '')
    setEmi(String(existing.emi_amount_minor / 100))
    setMonths(existing.total_installments)
    setFirstDue(existing.first_due_date)
    setPaidBefore(existing.installments_paid_before)
    setAccountId(existing.default_account_id)
  }, [existing])

  const parsedEmi = parseAmount(emi)
  const preview = parsedEmi.ok
    ? loanProgress({ emi_amount_minor: parsedEmi.minor, total_installments: months, first_due_date: firstDue, installments_paid_before: Math.min(paidBefore, months) }, 0, 0, today)
    : null

  const save = async () => {
    if (!parsedEmi.ok) return setError('Enter the monthly EMI amount')
    try {
      let partyId = existing?.party_id ?? null
      if (lender.trim() && lender.trim() !== existing?.party_name) partyId = await createParty(db, userId, { name: lender.trim(), kind: 'company' })
      if (!lender.trim()) partyId = null
      const input = {
        name,
        party_id: partyId,
        emi_amount_minor: parsedEmi.minor,
        total_installments: months,
        first_due_date: firstDue,
        installments_paid_before: paidBefore,
        default_account_id: accountId,
      }
      if (existing) await updateLoan(db, existing.id, input)
      else {
        const newId = await createLoan(db, userId, input)
        router.replace({ pathname: '/loan', params: { id: newId } })
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        return
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (e) {
      setError(e instanceof ValidationError ? (e.messageFor('name') ? 'Give the loan a name' : e.issues[0]!.message) : 'Couldn’t save. Try again.')
    }
  }

  return (
    <FormScreen title={existing ? 'Edit loan' : 'New loan'}>
      <Label>Name</Label>
      <TextField accessibilityLabel="Loan name" value={name} onChangeText={(v) => (setName(v), setError(null))} placeholder="Home loan" maxLength={60} />

      <Label hint="Optional">Lender</Label>
      <TextField accessibilityLabel="Lender" value={lender} onChangeText={setLender} placeholder="City Bank" maxLength={80} />

      <Label>Monthly EMI</Label>
      <AmountField value={emi} onChange={(v) => (setEmi(v), setError(null))} currency={currency} accessibilityLabel="Monthly EMI" />

      <Label hint="Total number of EMIs">Tenure</Label>
      <NumberStepper value={months} onChange={(n) => (setMonths(n), setPaidBefore((p) => Math.min(p, n)))} min={1} max={600} />

      <Label hint="When EMI #1 was or is due">First EMI date</Label>
      <DateStepper value={firstDue} onChange={setFirstDue} today={today} />

      <Label hint="Before you started using Hisab">EMIs already paid</Label>
      <NumberStepper value={paidBefore} onChange={setPaidBefore} min={0} max={months} />

      <Label hint="Pre-selected when you mark an EMI paid">Paid from</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {accounts.map((a) => (
          <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(accountId === a.id ? null : a.id)} />
        ))}
      </ScrollView>

      {preview && (
        <View className="mt-5 rounded-card bg-surface-muted p-4">
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {preview.monthsLeft} EMIs left ·{' '}
            <Money minor={preview.remainingAmount} currency={currency} grouping={grouping} size={13} weight="700" color={colors.text} /> remaining
          </Text>
          {preview.debtFreeBy && (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
              Debt-free by <Text style={{ color: colors.text, fontWeight: '700' }}>{formatDay(preview.debtFreeBy)}</Text>
            </Text>
          )}
        </View>
      )}

      <ErrorLine message={error} />
      <Button onPress={() => void save()}>{existing ? 'Save changes' : 'Add loan'}</Button>
    </FormScreen>
  )
}
