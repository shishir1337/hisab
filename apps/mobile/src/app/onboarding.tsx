import { parseAmount } from '@hisab/core'
import { createAccount, Q, saveProfile, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Check, Plus } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { Money } from '@/components/money'
import { Segmented } from '@/components/segmented'
import { ACCOUNT_TYPE_META, ACCOUNT_TYPES, type AccountType } from '@/features/accounts/meta'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

const CURRENCIES = ['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'MYR', 'SGD']
type Step = 'welcome' | 'currency' | 'accounts' | 'extras'

/** First run (spec §7.3 Onboarding, target < 2 minutes): currency → accounts with balances → optional loans/people. */
export default function OnboardingScreen() {
  const db = usePowerSync()
  const { userId, currency, grouping, onboardedAt, loaded } = useProfile()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { data: accounts } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const [step, setStep] = useState<Step>('welcome')
  const [cur, setCur] = useState(currency)
  const [group, setGroup] = useState(grouping)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Start from the saved preferences, not the defaults, once the profile has loaded.
  const seeded = useRef(false)
  useEffect(() => {
    if (!loaded || seeded.current) return
    seeded.current = true
    setCur(currency)
    setGroup(grouping)
  }, [loaded, currency, grouping])

  // Already set up (e.g. on another device, synced after this screen opened): nothing to do here.
  useEffect(() => {
    if (onboardedAt || (step === 'welcome' && accounts.length > 0)) router.replace('/')
  }, [onboardedAt, step, accounts.length])

  // Android back goes to the previous step instead of leaving the app.
  useEffect(() => {
    const prev: Partial<Record<Step, Step>> = { currency: 'welcome', accounts: 'currency', extras: 'accounts' }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const p = prev[step]
      if (!p) return false
      setStep(p)
      return true
    })
    return () => sub.remove()
  }, [step])

  /** Adds the typed account. Returns false (with a message) if it couldn't. */
  const addAccount = async (): Promise<boolean> => {
    if (busy) return false
    let minor = 0
    if (balance.trim()) {
      const p = parseAmount(balance)
      if (!p.ok) {
        setError('Enter the balance as a number, e.g. 25000')
        return false
      }
      minor = p.minor
    }
    if (!name.trim()) {
      setError('Give it a name, e.g. Cash or City Bank')
      return false
    }
    setBusy(true)
    try {
      await createAccount(db, userId, { name: name.trim(), type, opening_balance_minor: minor })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setName('')
      setBalance('')
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add the account')
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async (patch: Parameters<typeof saveProfile>[2]): Promise<boolean> => {
    try {
      await saveProfile(db, userId, patch)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save')
      return false
    }
  }

  const finish = async () => {
    if (await save({ onboarded_at: new Date().toISOString() })) router.replace('/')
  }

  const progress = { welcome: 0, currency: 1, accounts: 2, extras: 3 }[step]

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View className="mb-8 flex-row gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= progress ? colors.brand : colors.border }} />
          ))}
        </View>

        {step === 'welcome' && (
          <View className="flex-1 justify-center">
            <View className="h-12 w-12 items-center justify-center rounded-tile bg-brand">
              <Text style={{ color: colors.brandFg, fontWeight: '700', fontSize: 20 }}>H</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: 20 }}>Know where your money goes.</Text>
            <Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 10, lineHeight: 23 }}>
              Log spending in 3 seconds, see what you have, what’s due, and who owes you — no month-end struggle.
            </Text>
            <View className="mt-10">
              <Button onPress={() => setStep('currency')}>Get started</Button>
            </View>
          </View>
        )}

        {step === 'currency' && (
          <View className="flex-1">
            <Title title="Your currency" subtitle="Everything is tracked in this. Foreign income can still be recorded at the rate you got." />
            <View className="flex-row flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <Chip key={c} label={c} selected={cur === c} onPress={() => setCur(c)} />
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 24, marginBottom: 8 }}>Number style</Text>
            <Segmented
              value={group}
              onChange={setGroup}
              options={[
                { value: 'south_asian', label: '2,48,350' },
                { value: 'western', label: '248,350' },
              ]}
            />
            <View className="mt-auto pt-8">
              <Button
                onPress={async () => {
                  if (await save({ base_currency: cur, number_grouping: group })) setStep('accounts')
                }}
              >
                Continue
              </Button>
            </View>
          </View>
        )}

        {step === 'accounts' && (
          <View className="flex-1">
            <Title title="Where is your money?" subtitle="Add each place you keep money, with what’s in it right now. You can add more later." />
            {accounts.length > 0 && (
              <View className="mb-4 rounded-card border border-border bg-surface px-3.5">
                {accounts.map((a, i) => (
                  <View key={a.id} className="flex-row items-center justify-between py-3" style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
                    <View className="flex-row items-center gap-2">
                      <Check size={16} color={colors.positive} />
                      <Text style={{ color: colors.text, fontSize: 14.5 }}>{a.name}</Text>
                    </View>
                    <Money minor={a.balance_minor} currency={cur} grouping={group} size={14} reveal color={colors.text} />
                  </View>
                ))}
              </View>
            )}
            <View className="flex-row flex-wrap gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const M = ACCOUNT_TYPE_META[t]
                return <Chip key={t} size="sm" label={M.label} selected={type === t} onPress={() => setType(t)} />
              })}
            </View>
            <TextInput
              accessibilityLabel="Account name"
              placeholder={ACCOUNT_TYPE_META[type].example}
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={(v) => (setName(v), setError(null))}
              className="mt-3 h-[52px] rounded-[14px] border border-border bg-surface px-4"
              style={{ color: colors.text, fontSize: 16 }}
            />
            <View className="mt-2 h-[52px] flex-row items-center rounded-[14px] border border-border bg-surface px-4">
              <Text style={{ color: colors.textFaint, fontSize: 13, marginRight: 8 }}>{cur}</Text>
              <TextInput
                accessibilityLabel="Balance now"
                placeholder="Balance now"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                value={balance}
                onChangeText={(v) => (setBalance(v.replace(/[^\d.,]/g, '')), setError(null))}
                style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' }}
              />
            </View>
            {error && <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{error}</Text>}
            <Pressable accessibilityRole="button" onPress={() => void addAccount()} className="mt-3 h-11 flex-row items-center gap-2 self-start">
              <Plus size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{accounts.length ? 'Add another' : 'Add account'}</Text>
            </Pressable>
            <View className="mt-auto pt-8">
              <Button
                disabled={accounts.length === 0 && !name.trim()}
                onPress={async () => {
                  if (name.trim() && !(await addAccount())) return
                  setError(null)
                  setStep('extras')
                }}
              >
                Continue
              </Button>
            </View>
          </View>
        )}

        {step === 'extras' && (
          <View className="flex-1">
            <Title title="Anything ongoing?" subtitle="Optional — you can do these any time from Plan and People." />
            <ExtraRow emoji="🏦" title="A loan you’re paying (EMI)" hint="See months left and your debt-free date" onPress={() => router.push('/loan-form')} />
            <ExtraRow emoji="🤝" title="Money someone owes you" hint="Get reminded, nudge them on WhatsApp" onPress={() => router.push('/lend')} />
            <ExtraRow emoji="💼" title="Salary or rent that repeats" hint="Shows up as due — record it with one tap" onPress={() => router.push('/recurring')} />
            <View className="mt-auto pt-8">
              <Button onPress={() => void finish()}>Start using Hisab</Button>
            </View>
          </View>
        )}
        {error && step !== 'accounts' && <Text style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Title({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme()
  return (
    <View className="mb-6">
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>{subtitle}</Text>
    </View>
  )
}

function ExtraRow({ emoji, title, hint, onPress }: { emoji: string; title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="mb-2 flex-row items-center gap-3 rounded-card border border-border bg-surface p-4">
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <View className="flex-1">
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{hint}</Text>
      </View>
      <Plus size={18} color={colors.textMuted} />
    </Pressable>
  )
}
