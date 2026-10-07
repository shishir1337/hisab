import { parseAmount } from '@hisab/core'
import { createAccount, Q, saveProfile, seedDemoData, type AccountWithBalance } from '@hisab/db'
import { localDate } from '@hisab/core'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { ArrowLeft, Check, ChevronRight, Plus } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, TextField } from '@/components/form'
import { IconTile } from '@/components/icon-tile'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { Segmented } from '@/components/segmented'
import { ACCOUNT_TYPE_META, ACCOUNT_TYPES, type AccountType } from '@/features/accounts/meta'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

const CURRENCIES = ['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'MYR', 'SGD']
type Step = 'welcome' | 'currency' | 'accounts' | 'extras'
const PREV: Partial<Record<Step, Step>> = { currency: 'welcome', accounts: 'currency', extras: 'accounts' }

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
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const p = PREV[step]
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 28, height: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step !== 'welcome' ? (
            <Press accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(PREV[step]!)} hitSlop={6} style={{ width: 40, height: 40, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={22} color={colors.text} />
            </Press>
          ) : null}
          <View accessibilityRole="progressbar" accessibilityLabel={`Step ${progress + 1} of 4`} style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= progress ? colors.brand : colors.border }} />
            ))}
          </View>
        </View>

        {step === 'welcome' && (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <BrandMark size={52} />
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.8, lineHeight: 38, marginTop: 24 }}>
              Know where your money goes.
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 12, lineHeight: 24 }}>
              Log spending in 3 seconds, see what you have, what’s due, and who owes you — no month-end struggle.
            </Text>
            <View style={{ marginTop: 40 }}>
              <Button onPress={() => setStep('currency')}>Get started</Button>
            </View>
            {__DEV__ && (
              <View style={{ marginTop: 6 }}>
                <Button
                  variant="ghost"
                  onPress={async () => {
                    await seedDemoData(db, userId, localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))
                    await save({ onboarded_at: new Date().toISOString() })
                    router.replace('/')
                  }}
                >
                  Load demo data (dev)
                </Button>
              </View>
            )}
          </View>
        )}

        {step === 'currency' && (
          <View style={{ flex: 1 }}>
            <Title title="Your currency" subtitle="Everything is tracked in this. Foreign income can still be recorded at the rate you got." />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CURRENCIES.map((c) => (
                <Chip key={c} label={c} selected={cur === c} onPress={() => setCur(c)} />
              ))}
            </View>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600', marginTop: 28, marginBottom: 10 }}>Number style</Text>
            <Segmented
              value={group}
              onChange={setGroup}
              options={[
                { value: 'south_asian', label: '2,48,350' },
                { value: 'western', label: '248,350' },
              ]}
            />
            <View style={{ marginTop: 'auto', paddingTop: 32 }}>
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
          <View style={{ flex: 1 }}>
            <Title title="Where is your money?" subtitle="Add each place you keep money, with what’s in it right now. You can add more later." />
            {accounts.length > 0 && (
              <View style={{ marginBottom: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
                {accounts.map((a, i) => (
                  <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Check size={17} color={colors.positive} strokeWidth={2.4} />
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 }}>{a.name}</Text>
                    </View>
                    <Money minor={a.balance_minor} currency={cur} grouping={group} size={15} weight="600" reveal color={colors.text} />
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => {
                const M = ACCOUNT_TYPE_META[t]
                return <Chip key={t} size="sm" label={M.label} icon={(c) => <M.icon size={14} color={c} />} selected={type === t} onPress={() => setType(t)} />
              })}
            </View>
            <View style={{ marginTop: 14, gap: 8 }}>
              <TextField accessibilityLabel="Account name" placeholder={`e.g. ${ACCOUNT_TYPE_META[type].example}`} value={name} onChangeText={(v) => (setName(v), setError(null))} maxLength={60} />
              <AmountField accessibilityLabel="Balance now" value={balance} onChange={(v) => (setBalance(v), setError(null))} currency={cur} />
            </View>
            {error && <Text style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{error}</Text>}
            <Press
              accessibilityRole="button"
              onPress={() => void addAccount()}
              feedback="soft"
              style={{ marginTop: 12, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textFaint + '66' }}
            >
              <Plus size={17} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{accounts.length ? 'Add another' : 'Add this account'}</Text>
            </Press>
            <View style={{ marginTop: 'auto', paddingTop: 32 }}>
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
          <View style={{ flex: 1 }}>
            <Title title="Anything ongoing?" subtitle="Optional — you can do these any time from Plan and People." />
            <ExtraRow emoji="🏦" title="A loan you’re paying (EMI)" hint="See months left and your debt-free date" onPress={() => router.push('/loan-form')} />
            <ExtraRow emoji="🤝" title="Money someone owes you" hint="Get reminded, nudge them on WhatsApp" onPress={() => router.push('/lend')} />
            <ExtraRow emoji="💼" title="Salary or rent that repeats" hint="Shows up as due — record it with one tap" onPress={() => router.push('/recurring')} />
            <View style={{ marginTop: 'auto', paddingTop: 32 }}>
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
    <View style={{ marginBottom: 24 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>{subtitle}</Text>
    </View>
  )
}

function ExtraRow({ emoji, title, hint, onPress }: { emoji: string; title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      onPress={onPress}
      feedback="soft"
      style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}
    >
      <IconTile icon={emoji} tint="slate" size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{hint}</Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Press>
  )
}
