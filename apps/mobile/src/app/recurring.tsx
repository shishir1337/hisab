import { parseAmount } from '@hisab/core'
import {
  createRecurringRule,
  deleteRecurringRule,
  Q,
  QP,
  updateRecurringRule,
  ValidationError,
  type CategoryOption,
  type RecurringRuleView,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Switch, Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, DateStepper, ErrorLine, FormScreen, Label, NumberStepper, TextField } from '@/components/form'
import { Segmented } from '@/components/segmented'
import { cadence } from '@/features/plan/format'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

type RuleType = RecurringRuleView['type']
type Frequency = RecurringRuleView['frequency']

/** Add / edit a recurring item: salary, rent, subscriptions, a monthly transfer to savings… */
export default function RecurringScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const db = usePowerSync()
  const { userId, currency, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const toast = useToast()
  const { data: rules } = useQuery<RecurringRuleView>(QP.recurringRules)
  const existing = id ? rules.find((r) => r.id === id) : undefined

  const [type, setType] = useState<RuleType>('expense')
  const { data: categories } = useQuery<CategoryOption>(Q.categories, [type === 'income' ? 'income' : 'expense'])
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: parties } = useQuery<{ id: string; name: string }>(Q.parties)

  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [partyId, setPartyId] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [interval, setInterval] = useState(1)
  const [anchor, setAnchor] = useState(today)
  const [auto, setAuto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    if (existing) {
      loaded.current = true
      setType(existing.type)
      setAmount(String(existing.amount_minor / 100))
      setName(existing.note ?? '')
      setCategoryId(existing.category_id)
      setAccountId(existing.account_id)
      setToAccountId(existing.to_account_id)
      setPartyId(existing.party_id)
      setFrequency(existing.frequency)
      setInterval(existing.interval)
      setAnchor(existing.anchor_date)
      setAuto(existing.mode === 'auto')
    } else if (!id && accounts[0]) {
      loaded.current = true
      setAccountId(accounts[0].id)
    }
  }, [existing, id, accounts])

  const save = async () => {
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter the amount')
    if (!accountId) return setError('Add an account first')
    const input = {
      type,
      amount_minor: parsed.minor,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      party_id: type === 'income' ? partyId : null,
      note: name.trim() || null,
      frequency,
      interval,
      anchor_date: anchor,
      mode: auto ? ('auto' as const) : ('confirm' as const),
    }
    try {
      if (existing) await updateRecurringRule(db, existing.id, input)
      else await createRecurringRule(db, userId, { ...input, created_on: today })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (e) {
      setError(e instanceof ValidationError ? e.issues[0]!.message : 'Couldn’t save. Try again.')
    }
  }

  const remove = async () => {
    if (!existing) return
    await deleteRecurringRule(db, existing.id)
    toast({ message: 'Recurring item deleted (past entries kept)' })
    router.back()
  }

  return (
    <FormScreen title={existing ? 'Edit recurring' : 'New recurring'}>
      <View className="mt-2">
        <Segmented<RuleType>
          value={type}
          onChange={(t) => {
            setType(t)
            setCategoryId(null)
            setError(null)
          }}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />
      </View>

      <Label>Name</Label>
      <TextField
        accessibilityLabel="Name"
        value={name}
        onChangeText={setName}
        placeholder={type === 'income' ? 'Salary — Company A' : type === 'transfer' ? 'Monthly savings' : 'House rent'}
        maxLength={80}
      />

      <Label hint={type === 'income' ? 'Usual amount' : undefined}>Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      {type !== 'transfer' && (
        <>
          <Label>Category</Label>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={<Text style={{ fontSize: 14 }}>{c.icon}</Text>} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
            ))}
          </View>
        </>
      )}

      <Label>{type === 'income' ? 'Received in' : type === 'transfer' ? 'From' : 'Paid from'}</Label>
      <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} />
      {type === 'transfer' && (
        <>
          <Label>To</Label>
          <AccountChips accounts={accounts.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} />
        </>
      )}
      {type === 'income' && parties.length > 0 && (
        <>
          <Label hint="Optional">From (company / client)</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {parties.map((p) => (
              <Chip key={p.id} label={p.name} selected={partyId === p.id} onPress={() => setPartyId(partyId === p.id ? null : p.id)} />
            ))}
          </ScrollView>
        </>
      )}

      <Label hint={cadence({ frequency, interval })}>Repeats</Label>
      <Segmented<Frequency>
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: 'monthly', label: 'Monthly' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
      />
      <View className="mt-2">
        <NumberStepper value={interval} onChange={setInterval} min={1} max={52} />
      </View>

      <Label>{existing ? 'First date' : 'Next date'}</Label>
      <DateStepper value={anchor} onChange={setAnchor} today={today} />

      <View className="mt-5 flex-row items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
        <View className="flex-1 pr-3">
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>Record automatically</Text>
          <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>
            {auto ? 'Logged on its date without asking.' : 'Shows in “Due soon” — confirm with one tap.'}
          </Text>
        </View>
        <Switch value={auto} onValueChange={setAuto} trackColor={{ true: colors.brand }} accessibilityLabel="Record automatically" />
      </View>

      <ErrorLine message={error} />
      <Button onPress={() => void save()}>{existing ? 'Save changes' : 'Add recurring item'}</Button>
      {existing && (
        <View className="mt-2">
          <Button variant="ghost" onPress={() => void remove()}>
            Delete recurring item
          </Button>
        </View>
      )}
    </FormScreen>
  )
}

function AccountChips({ accounts, value, onChange }: { accounts: { id: string; name: string }[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {accounts.map((a) => (
        <Chip key={a.id} label={a.name} selected={value === a.id} onPress={() => onChange(a.id)} />
      ))}
    </ScrollView>
  )
}
