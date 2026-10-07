import { formatMoney, keypadFromMinor, lendingStatus, parseAmount } from '@hisab/core'
import { Q, QL, recordPersonRepayment, softDeleteTransaction, type LendingView } from '@hisab/db'
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

/**
 * "Got paid" (lent) / "Paid back" (borrowed) for a person: the amount is spread across their open
 * lendings oldest-first, so repaying a total never leaves a phantom balance (review M4 C1).
 */
export default function RepayScreen() {
  const { party: partyId, direction = 'lent' } = useLocalSearchParams<{ party: string; direction?: 'lent' | 'borrowed' }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone, hideAmounts } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const toast = useToast()
  const { data: partyRows } = useQuery<{ name: string }>(QL.partyById, [partyId])
  const { data: lendings } = useQuery<LendingView>(QL.lendingsForParty, [partyId])
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const name = partyRows[0]?.name ?? ''
  const outstanding = lendings
    .filter((l) => l.direction === direction && !l.closed_at)
    .reduce((s, l) => s + lendingStatus(l, l.repaid, today).outstanding, 0)

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [day, setDay] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || outstanding <= 0) return
    loaded.current = true
    setAmount(keypadFromMinor(outstanding))
  }, [outstanding])

  const lent = direction === 'lent'
  const chosen = accountId ?? accounts[0]?.id ?? null

  const save = async () => {
    if (busy) return
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter the amount')
    if (!chosen) return setError('Add an account first (Settings → Accounts)')
    setBusy(true)
    try {
      const ids = await recordPersonRepayment(db, userId, partyId, direction, { amount_minor: parsed.minor, account_id: chosen, occurred_on: day })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast({
        message: parsed.minor >= outstanding ? `Settled with ${name} 🎉` : `${hideAmounts ? `${currency} ••••` : formatMoney(parsed.minor, currency, { grouping }).text} recorded`,
        onUndo: async () => {
          for (const id of ids) await softDeleteTransaction(db, id)
        },
      })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <FormScreen title={lent ? `Got paid by ${name}` : `Paid back ${name}`}>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4 }}>
        {lent ? 'Owes you' : 'You owe'}: <Money minor={outstanding} currency={currency} grouping={grouping} size={13.5} weight="700" color={colors.text} />
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
