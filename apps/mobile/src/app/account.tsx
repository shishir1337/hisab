import { parseAmount } from '@hisab/core'
import { archiveAccount, createAccount, Q, updateAccount, ValidationError, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
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
  const insets = useSafeAreaInsets()
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View className="mb-5 flex-row items-center justify-between">
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {existing ? 'Edit account' : 'New account'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
            <X size={18} color={colors.text} />
          </Pressable>
        </View>

        <Label>Type</Label>
        <View className="flex-row flex-wrap gap-2">
          {ACCOUNT_TYPES.map((t) => {
            const M = ACCOUNT_TYPE_META[t]
            return (
              <Chip
                key={t}
                label={M.label}
                icon={<M.icon size={14} color={type === t ? colors.brandFg : colors.textMuted} />}
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
        <TextInput
          accessibilityLabel="Account name"
          value={name}
          onChangeText={(v) => (setName(v), setError(null))}
          placeholder={ACCOUNT_TYPE_META[type].example}
          placeholderTextColor={colors.textFaint}
          maxLength={60}
          className="h-[52px] rounded-[14px] border border-border bg-surface px-4"
          style={{ color: colors.text, fontSize: 16 }}
        />

        {existing ? (
          <View className="mt-[18px] mb-2 flex-row items-baseline justify-between">
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>Opening balance</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>
              Now: <Money minor={existing.balance_minor} currency={currency} grouping={grouping} size={12} weight="600" color={colors.textMuted} />
            </Text>
          </View>
        ) : (
          <Label>{type === 'card' && owed ? 'Amount owed on the card' : 'Balance right now'}</Label>
        )}
        <View className="h-[52px] flex-row items-center rounded-[14px] border border-border bg-surface px-4">
          <Text style={{ color: colors.textFaint, fontSize: 13, fontWeight: '500', marginRight: 8 }}>{currency}</Text>
          <TextInput
            accessibilityLabel="Balance"
            value={opening}
            onChangeText={(v) => (setOpening(v.replace(/[^\d.,]/g, '')), setError(null))}
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}
          />
        </View>
        {type === 'card' && (
          <View className="mt-3 flex-row items-center justify-between">
            <Text style={{ color: colors.textMuted, fontSize: 13.5 }}>This is money I owe (credit card)</Text>
            <Switch value={owed} onValueChange={setOwed} trackColor={{ true: colors.brand }} />
          </View>
        )}

        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginTop: 10, minHeight: 18 }}>
          {error ?? ''}
        </Text>
        <Button onPress={() => void save()} loading={saving}>
          {existing ? 'Save changes' : 'Add account'}
        </Button>
        {existing && (
          <View className="mt-2">
            <Button variant="ghost" onPress={() => void toggleArchive()}>
              {existing.archived ? 'Restore account' : 'Archive account'}
            </Button>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Label({ children }: { children: string }) {
  const { colors } = useTheme()
  return <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500', marginTop: 18, marginBottom: 8 }}>{children}</Text>
}
