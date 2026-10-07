import { parseAmount } from '@hisab/core'
import { postOccurrence, Q, QP, skipOccurrence, softDeleteTransaction, unskipOccurrence, type RecurringRuleView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { ChipRow, AmountField, DateStepper, FooterError, FormScreen, formatDay, Label } from '@/components/form'
import { IconTile } from '@/components/icon-tile'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

/** Record one occurrence of a recurring item with an adjusted amount/account/day, or skip it. */
export default function DueScreen() {
  const { rule: ruleId, date } = useLocalSearchParams<{ rule: string; date: string }>()
  const db = usePowerSync()
  const { userId, currency, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const toast = useToast()
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const rule = rules.find((r) => r.id === ruleId)

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [day, setDay] = useState(date && date < today ? date : today)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!rule || loaded.current) return
    loaded.current = true
    setAmount(String(rule.amount_minor / 100))
    setAccountId(rule.account_id)
  }, [rule])

  if (!rule || !date) return <FormScreen title="Due">{null}</FormScreen>

  const record = async () => {
    if (busy) return
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter the amount')
    setBusy(true)
    try {
      const r = await postOccurrence(db, userId, rule, date, { amount_minor: parsed.minor, account_id: accountId ?? rule.account_id, occurred_on: day })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast(r.created ? { message: 'Recorded', onUndo: () => softDeleteTransaction(db, r.id) } : { message: 'Already recorded' })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t record it')
      setBusy(false)
    }
  }

  const skip = async () => {
    if (busy) return
    setBusy(true)
    await skipOccurrence(db, userId, rule.id, date)
    toast({ message: `Skipped ${formatDay(date)}`, onUndo: () => unskipOccurrence(db, rule.id, date) })
    router.back()
  }

  return (
    <FormScreen
      title={rule.type === 'income' ? 'Record income' : rule.type === 'transfer' ? 'Record transfer' : 'Record payment'}
      footer={
        <>
          <FooterError message={error} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" disabled={busy} onPress={() => void skip()} accessibilityLabel="Skip this one — it won’t be recorded">
                Skip
              </Button>
            </View>
            <View style={{ flex: 2 }}>
              <Button onPress={() => void record()} loading={busy}>
                Record
              </Button>
            </View>
          </View>
        </>
      }
    >
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
        <IconTile icon={rule.category_icon ?? '🔁'} tint={rule.category_color} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{rule.note || rule.category_name || 'Transfer'}</Text>
          <Text style={{ color: date < today ? colors.danger : colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: date < today ? '600' : '400' }}>
            {date < today ? 'Overdue · was due ' : 'Due '}
            {formatDay(date)}
            {rule.party_name ? ` · ${rule.party_name}` : ''}
          </Text>
        </View>
      </View>

      <Label hint="Change it if this month was different">Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      <Label>{rule.type === 'income' ? 'Received in' : 'Paid from'}</Label>
      <ChipRow>
        {accounts.map((a) => (
          <Chip key={a.id} label={a.name} selected={(accountId ?? rule.account_id) === a.id} onPress={() => setAccountId(a.id)} />
        ))}
      </ChipRow>

      <Label>Date</Label>
      <DateStepper value={day} onChange={(d) => setDay(d > today ? today : d)} today={today} />

    </FormScreen>
  )
}
