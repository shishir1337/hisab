import { parseAmount } from '@hisab/core'
import { postOccurrence, Q, QP, skipOccurrence, softDeleteTransaction, unskipOccurrence, type RecurringRuleView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, DateStepper, ErrorLine, FormScreen, formatDay, Label } from '@/components/form'
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

  useEffect(() => {
    if (!rule || loaded.current) return
    loaded.current = true
    setAmount(String(rule.amount_minor / 100))
    setAccountId(rule.account_id)
  }, [rule])

  if (!rule || !date) return <FormScreen title="Due">{null}</FormScreen>

  const record = async () => {
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter the amount')
    try {
      const id = await postOccurrence(db, userId, rule, date, { amount_minor: parsed.minor, account_id: accountId ?? rule.account_id, occurred_on: day })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast({ message: 'Recorded', onUndo: () => softDeleteTransaction(db, id) })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t record it')
    }
  }

  const skip = async () => {
    await skipOccurrence(db, userId, rule.id, date)
    toast({ message: `Skipped ${formatDay(date)}`, onUndo: () => unskipOccurrence(db, rule.id, date) })
    router.back()
  }

  return (
    <FormScreen title={rule.type === 'income' ? 'Record income' : rule.type === 'transfer' ? 'Record transfer' : 'Record payment'}>
      <View className="mt-2 flex-row items-center gap-3 rounded-card border border-border bg-surface p-3.5">
        <IconTile icon={rule.category_icon ?? '🔁'} tint={rule.category_color} />
        <View className="flex-1">
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{rule.note || rule.category_name || 'Transfer'}</Text>
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>
            Due {formatDay(date)}
            {rule.party_name ? ` · ${rule.party_name}` : ''}
          </Text>
        </View>
      </View>

      <Label hint="Change it if this month was different">Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      <Label>{rule.type === 'income' ? 'Received in' : 'Paid from'}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {accounts.map((a) => (
          <Chip key={a.id} label={a.name} selected={(accountId ?? rule.account_id) === a.id} onPress={() => setAccountId(a.id)} />
        ))}
      </ScrollView>

      <Label>Date</Label>
      <DateStepper value={day} onChange={(d) => setDay(d > today ? today : d)} today={today} />

      <ErrorLine message={error} />
      <Button onPress={() => void record()}>Record</Button>
      <View className="mt-2">
        <Button variant="ghost" onPress={() => void skip()}>
          Skip this one
        </Button>
      </View>
    </FormScreen>
  )
}
