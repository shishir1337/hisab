import { addDays, parseAmount, toE164 } from '@hisab/core'
import { createLending, createParty, Q, QL, updateLending, ValidationError, type LendingView, type PersonWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { Avatar } from '@/components/avatar'
import { ChipRow, AmountField, DateStepper, FooterError, FormScreen, Label, SwitchRow, TextField } from '@/components/form'
import { Segmented } from '@/components/segmented'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

type Direction = 'lent' | 'borrowed'
const BEFORE_HISAB = '__before__'

/** Record money lent to / borrowed from someone (spec §7.3 quick-log "Lend"). */
export default function LendScreen() {
  const params = useLocalSearchParams<{ party?: string; edit?: string }>()
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
  const { data: editing } = useQuery<LendingView>('select l.*, 0 as repaid from lendings l where l.id = ?', [params.edit ?? ''])
  const existing = params.edit ? editing[0] : undefined
  const loaded = useRef(false)
  useEffect(() => {
    if (!existing || loaded.current) return
    loaded.current = true
    setDirection(existing.direction)
    setPartyId(existing.party_id)
    setAmount(String(existing.principal_minor / 100))
    setStartedOn(existing.started_on)
    setHasDue(Boolean(existing.due_on))
    if (existing.due_on) setDueOn(existing.due_on)
  }, [existing])
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
      if (existing) {
        await updateLending(db, existing.id, { principal_minor: parsed.minor, started_on: startedOn, due_on: hasDue ? dueOn : null, note: existing.note })
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.back()
        return
      }
      const pid = partyId ?? (await createParty(db, userId, { name: newName.trim(), kind: 'person', phone }))
      // Remember the new person so a retry after an error doesn't create a duplicate.
      setPartyId(pid)
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
      setError(e instanceof ValidationError ? e.issues[0]!.message : e instanceof Error ? e.message : 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <FormScreen
      title={existing ? 'Edit lending' : direction === 'lent' ? 'Lent money' : 'Borrowed money'}
      footer={
        <>
          <FooterError message={error} />
          <Button onPress={() => void save()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      {existing ? (
        // Only the amount and dates of a lending can change; who and which account are fixed once recorded.
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
          <Avatar name={people.find((p) => p.id === existing.party_id)?.name ?? '?'} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{existing.direction === 'lent' ? 'Lent to' : 'Borrowed from'}</Text>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {people.find((p) => p.id === existing.party_id)?.name ?? ''}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 8 }}>
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
            <ChipRow>
              {persons.map((p) => (
                <Chip key={p.id} label={p.name} selected={partyId === p.id} onPress={() => (setPartyId(partyId === p.id ? null : p.id), setError(null))} />
              ))}
            </ChipRow>
          )}
          {!partyId && (
            <View style={{ marginTop: persons.length > 0 ? 10 : 0, gap: 8 }}>
              <TextField accessibilityLabel="Name" value={newName} onChangeText={(v) => (setNewName(v), setError(null))} placeholder={persons.length ? 'Or someone new — name' : 'Name'} maxLength={80} />
              <TextField accessibilityLabel="Phone (optional)" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} placeholder="Phone for WhatsApp reminders (optional)" />
            </View>
          )}
        </>
      )}

      <Label>Amount</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Amount" />

      {!existing && (
        <>
          <Label>{direction === 'lent' ? 'Given from' : 'Received in'}</Label>
          <ChipRow>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={chosenAccount === a.id} onPress={() => setAccountId(a.id)} />
            ))}
            <Chip label="Before Hisab" selected={chosenAccount === BEFORE_HISAB} onPress={() => setAccountId(BEFORE_HISAB)} />
          </ChipRow>
          {chosenAccount === BEFORE_HISAB && (
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 8 }}>Happened before you used Hisab — your account balances won’t change.</Text>
          )}
        </>
      )}

      <Label>Date</Label>
      <DateStepper value={startedOn} onChange={(d) => setStartedOn(d > today ? today : d)} today={today} />

      <View style={{ marginTop: 22, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingBottom: hasDue ? 14 : 0 }}>
        <SwitchRow
          label={direction === 'lent' ? 'Expect it back by a date' : 'Return it by a date'}
          description={hasDue ? 'Hisab reminds you on the day, then every few days until it’s settled.' : undefined}
          value={hasDue}
          onValueChange={setHasDue}
        />
        {hasDue && <DateStepper value={dueOn} onChange={(d) => setDueOn(d < startedOn ? startedOn : d)} today={today} />}
      </View>
    </FormScreen>
  )
}
