import { addDays, parseAmount, toE164 } from '@hisab/core'
import { createLending, createParty, Q, QL, ValidationError, type PersonWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, DateStepper, ErrorLine, FormScreen, Label, TextField } from '@/components/form'
import { Segmented } from '@/components/segmented'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

type Direction = 'lent' | 'borrowed'
const BEFORE_HISAB = '__before__'

/** Record money lent to / borrowed from someone (spec §7.3 quick-log "Lend"). */
export default function LendScreen() {
  const params = useLocalSearchParams<{ party?: string }>()
  const db = usePowerSync()
  const { userId, currency, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const { data: people } = useQuery<PersonWithBalance>(QL.peopleWithBalances)
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)

  const [direction, setDirection] = useState<Direction>('lent')
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [startedOn, setStartedOn] = useState(today)
  const [hasDue, setHasDue] = useState(false)
  const [dueOn, setDueOn] = useState(addDays(today, 14))
  const [accountId, setAccountId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosenAccount = accountId ?? accounts[0]?.id ?? BEFORE_HISAB
  const persons = people.filter((p) => p.kind === 'person')

  const save = async () => {
    if (busy) return
    const parsed = parseAmount(amount)
    if (!partyId && !newName.trim()) return setError('Who is it with?')
    if (!parsed.ok) return setError('Enter the amount')
    let phone: string | null = null
    if (!partyId && newPhone.trim()) {
      phone = toE164(newPhone)
      if (!phone) return setError('Check the phone number (e.g. 01712-345678)')
    }
    setBusy(true)
    try {
      const pid = partyId ?? (await createParty(db, userId, { name: newName.trim(), kind: 'person', phone }))
      await createLending(db, userId, {
        party_id: pid,
        direction,
        principal_minor: parsed.minor,
        started_on: startedOn,
        due_on: hasDue ? dueOn : null,
        account_id: chosenAccount === BEFORE_HISAB ? null : chosenAccount,
      })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace({ pathname: '/person', params: { id: pid } })
    } catch (e) {
      setError(e instanceof ValidationError ? e.issues[0]!.message : 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <FormScreen title={direction === 'lent' ? 'Lent money' : 'Borrowed money'}>
      <View className="mt-2">
        <Segmented<Direction>
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'lent', label: 'I lent' },
            { value: 'borrowed', label: 'I borrowed' },
          ]}
        />
      </View>

      <Label>{direction === 'lent' ? 'To' : 'From'}</Label>
      {persons.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {persons.map((p) => (
            <Chip key={p.id} label={p.name} selected={partyId === p.id} onPress={() => (setPartyId(partyId === p.id ? null : p.id), setError(null))} />
          ))}
        </ScrollView>
      )}
      {!partyId && (
        <View className="mt-2 gap-2">
          <TextField accessibilityLabel="Name" value={newName} onChangeText={(v) => (setNewName(v), setError(null))} placeholder={persons.length ? 'Or someone new: name' : 'Name'} maxLength={80} />
          <TextInput
            accessibilityLabel="Phone (optional)"
            keyboardType="phone-pad"
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="Phone for WhatsApp reminders (optional)"
            placeholderTextColor={colors.textFaint}
            className="h-[52px] rounded-[14px] border border-border bg-surface px-4"
            style={{ color: colors.text, fontSize: 16 }}
          />
        </View>
      )}

      <Label>Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      <Label>{direction === 'lent' ? 'Given from' : 'Received in'}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {accounts.map((a) => (
          <Chip key={a.id} label={a.name} selected={chosenAccount === a.id} onPress={() => setAccountId(a.id)} />
        ))}
        <Chip label="Before Hisab" selected={chosenAccount === BEFORE_HISAB} onPress={() => setAccountId(BEFORE_HISAB)} />
      </ScrollView>
      {chosenAccount === BEFORE_HISAB && (
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 6 }}>Happened before you used Hisab — your account balances won’t change.</Text>
      )}

      <Label>Date</Label>
      <DateStepper value={startedOn} onChange={(d) => setStartedOn(d > today ? today : d)} today={today} />

      <View className="mt-5 flex-row items-center justify-between">
        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>{direction === 'lent' ? 'Expect it back by' : 'Return it by'}</Text>
        <Switch value={hasDue} onValueChange={setHasDue} trackColor={{ true: colors.brand }} accessibilityLabel="Set a due date" />
      </View>
      {hasDue && (
        <View className="mt-2">
          <DateStepper value={dueOn} onChange={(d) => setDueOn(d < startedOn ? startedOn : d)} today={today} />
          <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 6 }}>Hisab will remind you on this date, then every few days until it’s settled.</Text>
        </View>
      )}

      <ErrorLine message={error} />
      <Button onPress={() => void save()} loading={busy}>
        Save
      </Button>
    </FormScreen>
  )
}
