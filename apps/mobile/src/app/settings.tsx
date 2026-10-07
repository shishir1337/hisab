import { Q, saveProfile, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { router } from 'expo-router'
import * as LocalAuthentication from 'expo-local-authentication'
import { AlertTriangle, ChevronRight, LogOut, Plus } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { NumberStepper, SwitchRow, TextField } from '@/components/form'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { Divider, SectionHeader, StackScreen } from '@/components/screen'
import { Segmented } from '@/components/segmented'
import { ACCOUNT_TYPE_META } from '@/features/accounts/meta'
import { cancelOwnNotifications } from '@/lib/notifications'
import { usePrefs } from '@/lib/prefs'
import { useProfile } from '@/lib/profile'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { useToast } from '@/lib/undo'

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme()
  const { user } = useSession()
  const { userId, currency, grouping, timeZone, hideAmounts, displayName } = useProfile()
  const db = usePowerSync()
  const toast = useToast()
  const { data: issues } = useQuery<{ n: number }>('select count(*) as n from upload_issues')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Unsynced changes counted when "remove data" is tapped; non-null = asking for confirmation.
  const [wipeAsk, setWipeAsk] = useState<number | null>(null)
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const pref = (patch: Parameters<typeof saveProfile>[2]) =>
    void saveProfile(db, userId, patch).catch((e: unknown) => toast({ message: e instanceof Error ? e.message : 'Couldn’t save' }))
  const signOut = async (wipe: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      await cancelOwnNotifications().catch(() => {})
      if (wipe) {
        try {
          await db.disconnectAndClear()
        } catch {
          return toast({ message: 'Couldn’t remove the data from this phone. You’re still signed in.' })
        }
      }
      const { error } = await supabase.auth.signOut()
      if (error) await supabase.auth.signOut({ scope: 'local' })
    } finally {
      setBusy(false)
    }
  }
  const askWipe = async () => {
    const [pending, parked] = await Promise.all([
      db.get<{ n: number }>('select count(*) as n from ps_crud').catch(() => ({ n: 0 })),
      db.get<{ n: number }>('select count(*) as n from upload_issues').catch(() => ({ n: 0 })),
    ])
    setWipeAsk(pending.n + parked.n)
  }
  const { data: accounts } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const { prefs, update } = usePrefs()
  const nudgeHour = Number(prefs.nudgeTime.slice(0, 2))
  const issueCount = issues[0]?.n ?? 0
  const [name, setName] = useState<string | null>(null)
  const nameValue = name ?? displayName ?? ''

  return (
    <StackScreen title="Settings" subtitle={user?.email ?? undefined}>
      {issueCount > 0 && (
        <Press
          accessibilityRole="button"
          onPress={() => router.push('/issues')}
          feedback="soft"
          style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.warning + '55', backgroundColor: colors.surface, padding: 14 }}
        >
          <AlertTriangle size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>
              {issueCount} change{issueCount === 1 ? '' : 's'} couldn’t sync
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 1 }}>Review what the server refused</Text>
          </View>
          <ChevronRight size={18} color={colors.textFaint} />
        </Press>
      )}

      <SectionHeader first title="Profile" description="How Hisab greets you." />
      <TextField
        accessibilityLabel="Your name"
        value={nameValue}
        onChangeText={setName}
        placeholder="Your name"
        maxLength={80}
        onEndEditing={() => {
          const v = nameValue.trim()
          if (v !== (displayName ?? '')) pref({ display_name: v || null })
          setName(null)
        }}
      />

      <SectionHeader title="Accounts" description="Open one to rename it, change its balance or archive it." />
      <Panel>
        {accounts.map((a, i) => {
          const meta = ACCOUNT_TYPE_META[a.type]
          return (
            <View key={a.id}>
              {i > 0 && <Divider inset={52} />}
              <Press
                accessibilityRole="button"
                accessibilityHint="Edit account"
                onPress={() => router.push({ pathname: '/account', params: { id: a.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10, opacity: a.archived ? 0.55 : 1 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
                  <meta.icon size={18} color={colors.text} />
                </View>
                <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                    {a.name}
                  </Text>
                  <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 1 }}>{a.archived ? 'Archived' : meta.label}</Text>
                </View>
                <Money minor={a.balance_minor} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={colors.text} />
                <ChevronRight size={16} color={colors.textFaint} style={{ marginLeft: 6, marginRight: -4 }} />
              </Press>
            </View>
          )
        })}
        {accounts.length > 0 && <Divider />}
        <Press accessibilityRole="button" onPress={() => router.push('/account')} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textFaint + '88' }}>
            <Plus size={18} color={colors.text} />
          </View>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: 12 }}>Add account</Text>
        </Press>
      </Panel>

      <SectionHeader title="Money" description="Your home currency and how numbers are written." />
      <Panel padded>
        <FieldLabel>Currency</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR'].map((c) => (
            <Chip key={c} size="sm" label={c} selected={currency === c} onPress={() => pref({ base_currency: c })} />
          ))}
        </View>
        <FieldLabel spaced>Number style</FieldLabel>
        <Segmented
          value={grouping}
          onChange={(g) => pref({ number_grouping: g })}
          options={[
            { value: 'south_asian', label: '2,48,350' },
            { value: 'western', label: '248,350' },
          ]}
        />
        <FieldLabel spaced hint={timeZone}>
          Time zone
        </FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[...new Set([deviceTz, 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'])].map((tz) => (
            <Chip key={tz} size="sm" label={tz.split('/').pop()!.replace('_', ' ')} selected={timeZone === tz} onPress={() => pref({ timezone: tz })} />
          ))}
        </View>
      </Panel>

      <SectionHeader title="Display" description="Privacy and appearance." />
      <Panel>
        <SwitchRow label="Hide amounts" description="Or tap the balance card. Handy when people are around." value={hideAmounts} onValueChange={(v) => pref({ hide_amounts: v })} />
        <Divider />
        <SwitchRow
          label="App lock"
          description="Fingerprint, face or device PIN when opening Hisab on this phone."
          value={prefs.appLock}
          onValueChange={async (v) => {
            if (v) {
              const level = await LocalAuthentication.getEnrolledLevelAsync()
              if (level === LocalAuthentication.SecurityLevel.NONE) return toast({ message: 'Set a screen lock on your phone first.' })
              const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on app lock' })
              if (!r.success) return
            }
            update({ appLock: v })
          }}
        />
        <Divider />
        <View style={{ paddingVertical: 14 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', marginBottom: 10 }}>Appearance</Text>
          <Segmented<ThemePreference>
            value={preference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={setPreference}
          />
        </View>
      </Panel>

      <SectionHeader title="Reminders" description="Notifications on this phone." />
      <Panel>
        <SwitchRow label="Daily nudge" description="Only if you haven’t logged anything that day." value={prefs.nudgeEnabled} onValueChange={(v) => update({ nudgeEnabled: v })} />
        {prefs.nudgeEnabled && (
          <View style={{ paddingBottom: 14 }}>
            <NumberStepper
              value={nudgeHour}
              min={6}
              max={23}
              format={hourLabel}
              accessibilityLabel="Nudge time"
              onChange={(h) => update({ nudgeTime: `${String(h).padStart(2, '0')}:00` })}
            />
          </View>
        )}
        <Divider />
        <View style={{ paddingVertical: 14 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Money owed to you</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, marginBottom: 10 }}>Remind again this often after the due date.</Text>
          <NumberStepper
            value={prefs.reminderIntervalDays}
            min={1}
            max={30}
            format={(n) => (n === 1 ? 'Every day' : `Every ${n} days`)}
            accessibilityLabel="Reminder interval"
            onChange={(n) => update({ reminderIntervalDays: n })}
          />
        </View>
      </Panel>

      <SectionHeader title="Session" description="Signing out keeps your data on this phone for next time." />
      <Panel>
        <Press accessibilityRole="button" onPress={() => void signOut(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
          <LogOut size={18} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Sign out</Text>
        </Press>
        <Divider />
        {wipeAsk === null ? (
          <Press accessibilityRole="button" onPress={() => void askWipe()} style={{ paddingVertical: 14 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Sign out and remove data from this phone</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>For a shared or old phone. Your synced data stays in your account.</Text>
          </Press>
        ) : (
          <View style={{ paddingVertical: 14 }}>
            <Text style={{ color: wipeAsk > 0 ? colors.danger : colors.text, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>
              {wipeAsk > 0
                ? `${wipeAsk} ${wipeAsk === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet and will be lost. Connect to the internet first to keep ${wipeAsk === 1 ? 'it' : 'them'}.`
                : 'Everything is synced. Remove Hisab’s data from this phone and sign out?'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" onPress={() => setWipeAsk(null)}>
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant={wipeAsk > 0 ? 'danger' : 'primary'} loading={busy} onPress={() => void signOut(true)}>
                  {wipeAsk > 0 ? 'Remove anyway' : 'Remove & sign out'}
                </Button>
              </View>
            </View>
          </View>
        )}
      </Panel>

      <SectionHeader title="Danger zone" description="Permanent. There’s no undo." />
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.danger + '40', backgroundColor: colors.surface, padding: 16 }}>
        {!deleting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Delete my account</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>Deletes your account and all your data.</Text>
            </View>
            <Press
              accessibilityRole="button"
              onPress={() => setDeleting(true)}
              feedback="scale"
              style={{ height: 38, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger + '66' }}
            >
              <Text style={{ color: colors.danger, fontSize: 13.5, fontWeight: '600' }}>Delete…</Text>
            </Press>
          </View>
        ) : (
          <View>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>
              Type <Text style={{ fontWeight: '700' }}>DELETE</Text> to permanently delete your account and all data. This can’t be undone.
            </Text>
            <TextInput
              accessibilityLabel="Type DELETE"
              autoCapitalize="characters"
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textFaint}
              style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text, fontSize: 15, letterSpacing: 1 }}
            />
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" onPress={() => (setDeleting(false), setConfirmText(''))}>
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  variant="danger"
                  disabled={confirmText !== 'DELETE' || busy}
                  loading={busy}
                  onPress={async () => {
                    if (busy) return
                    setBusy(true)
                    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
                    if (error) {
                      setBusy(false)
                      return toast({ message: 'Couldn’t delete the account. Check your connection and try again.' })
                    }
                    await cancelOwnNotifications().catch(() => {})
                    await db.disconnectAndClear().catch(() => {})
                    await supabase.auth.signOut({ scope: 'local' })
                  }}
                >
                  Delete forever
                </Button>
              </View>
            </View>
          </View>
        )}
      </View>
    </StackScreen>
  )
}

/** Settings card: rows separated by hairlines (web: Panel). */
function Panel({ children, padded }: { children: ReactNode; padded?: boolean }) {
  const { colors } = useTheme()
  return <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: padded ? 16 : 14, paddingVertical: padded ? 16 : 0 }}>{children}</View>
}

function FieldLabel({ children, hint, spaced }: { children: string; hint?: string; spaced?: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spaced ? 18 : 0, marginBottom: 10 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{children}</Text>
      {hint ? <Text style={{ color: colors.textFaint, fontSize: 12.5 }}>{hint}</Text> : null}
    </View>
  )
}
