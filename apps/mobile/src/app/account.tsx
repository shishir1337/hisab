import { parseAmount } from '@hisab/core'
import { archiveAccount, createAccount, Q, updateAccount, ValidationError, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, FooterError, FormLink, FormScreen, Label, SwitchRow, TextField } from '@/components/form'
import { ACCOUNT_TYPE_META, ACCOUNT_TYPES, type AccountType } from '@/features/accounts/meta'
import { Money } from '@/components/money'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

/** Add or edit an account. Opening balance = what is in it right now (negative for card debt). */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const { colors } = useTheme()
  const toast = useToast()
  const { data } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const existing = id ? data.find((a) => a.id === id) : undefined

  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [opening, setOpening] = useState('')
  const [owed, setOwed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Initialise once per account: live query re-emits (any write) must not wipe what the user typed.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!existing || loadedFor.current === existing.id) return
    loadedFor.current = existing.id
    setName(existing.name)
    setType(existing.type)
    setOpening(existing.opening_balance_minor === 0 ? '' : String(Math.abs(existing.opening_balance_minor) / 100))
    setOwed(existing.opening_balance_minor < 0)
  }, [existing])

  const save = async () => {
    let minor = 0
    if (opening.trim() !== '' && opening.trim() !== '0') {
      const parsed = parseAmount(opening)
      if (!parsed.ok) return setError('Enter the balance as a number, e.g. 25000 or 1,250.50')
      minor = owed ? -parsed.minor : parsed.minor
    }
    setSaving(true)
    try {
      const input = { name, type, opening_balance_minor: minor }
      if (existing) await updateAccount(db, existing.id, input)
      else await createAccount(db, userId, input)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (e) {
      setError(e instanceof ValidationError ? (e.messageFor('name') ? 'Give the account a name' : e.issues[0]!.message) : 'Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleArchive = async () => {
    if (!existing) return
    const archived = !existing.archived
    await archiveAccount(db, existing.id, archived)
    toast({ message: archived ? `${existing.name} archived` : `${existing.name} restored`, onUndo: () => archiveAccount(db, existing.id, !archived) })
    router.back()
  }

  const typeMeta = ACCOUNT_TYPE_META[type]
  return (
    <FormScreen
      title={existing ? 'Edit account' : 'New account'}
      footer={
        <>
          <FooterError message={error} />
          <Button onPress={() => void save()} loading={saving}>
            {existing ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <Label first>Type</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ACCOUNT_TYPES.map((t) => {
          const M = ACCOUNT_TYPE_META[t]
          return (
            <Chip
              key={t}
              label={M.label}
              icon={(c) => <M.icon size={15} color={c} />}
              selected={type === t}
              onPress={() => {
                setType(t)
                if (t !== 'card') setOwed(false)
              }}
            />
          )
        })}
      </View>

      <Label>Name</Label>
      <TextField accessibilityLabel="Account name" value={name} onChangeText={(v) => (setName(v), setError(null))} placeholder={`e.g. ${typeMeta.example}`} maxLength={60} />

      <Label hint={existing ? undefined : 'What’s in it right now'}>{existing ? 'Opening balance' : type === 'card' && owed ? 'Amount owed on the card' : 'Balance'}</Label>
      <AmountField value={opening} onChange={(v) => (setOpening(v), setError(null))} currency={currency} accessibilityLabel="Balance" />
      {existing && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
          Balance now: <Money minor={existing.balance_minor} currency={currency} grouping={grouping} size={13} weight="600" color={colors.text} />
        </Text>
      )}
      {type === 'card' && (
        <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
          <SwitchRow label="This is money I owe" description="A credit card balance counts against your total." value={owed} onValueChange={setOwed} />
        </View>
      )}

      {existing && <FormLink label={existing.archived ? 'Restore account' : 'Archive account'} onPress={() => void toggleArchive()} />}
    </FormScreen>
  )
}
