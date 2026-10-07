import { lendingStatus, parseAmount } from '@hisab/core'
import { Q, recordRepayment, softDeleteTransaction, type LendingView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, DateStepper, ErrorLine, FormScreen, Label } from '@/components/form'
import { Money } from '@/components/money'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

/** "Got paid" (lent) / "Paid back" (borrowed): full or partial repayment. */
export default function RepayScreen() {
  const { lending: lendingId } = useLocalSearchParams<{ lending: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const toast = useToast()
  const { data: rows } = useQuery<LendingView & { party_name: string }>(
    `select l.*, p.name as party_name, coalesce((select sum(t.amount_minor) from transactions t where t.lending_id = l.id and t.deleted_at is null
       and t.type = case l.direction when 'lent' then 'lending_in' else 'lending_out' end), 0) as repaid
     from lendings l join parties p on p.id = l.party_id where l.id = ?`,
    [lendingId],
  )
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const lending = rows[0]

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [day, setDay] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)
  const outstanding = lending ? lendingStatus(lending, lending.repaid, today).outstanding : 0

  useEffect(() => {
    if (!lending || loaded.current) return
    loaded.current = true
    setAmount(String(outstanding / 100))
  }, [lending, outstanding])

  if (!lending) return <FormScreen title="Repayment">{null}</FormScreen>
  const lent = lending.direction === 'lent'
  const chosen = accountId ?? accounts[0]?.id ?? null

  const save = async () => {
    if (busy) return
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter the amount')
    if (!chosen) return setError('Add an account first')
    setBusy(true)
    try {
      const id = await recordRepayment(db, userId, lending.id, { amount_minor: parsed.minor, account_id: chosen, occurred_on: day })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const settled = parsed.minor >= outstanding
      toast({ message: settled ? `Settled with ${lending.party_name} 🎉` : 'Repayment recorded', onUndo: () => softDeleteTransaction(db, id) })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <FormScreen title={lent ? `Got paid by ${lending.party_name}` : `Paid back ${lending.party_name}`}>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4 }}>
        Outstanding: <Money minor={outstanding} currency={currency} grouping={grouping} size={13.5} weight="700" color={colors.text} />
      </Text>

      <Label hint="Less for a partial payment">Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      <Label>{lent ? 'Received in' : 'Paid from'}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {accounts.map((a) => (
          <Chip key={a.id} label={a.name} selected={chosen === a.id} onPress={() => setAccountId(a.id)} />
        ))}
      </ScrollView>

      <Label>Date</Label>
      <DateStepper value={day} onChange={(d) => setDay(d > today ? today : d)} today={today} />

      <ErrorLine message={error} />
      <Button onPress={() => void save()} loading={busy}>
        Save
      </Button>
    </FormScreen>
  )
}
