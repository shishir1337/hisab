import { Q, saveProfile, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { AlertTriangle, ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { useToast } from '@/lib/undo'
import * as LocalAuthentication from 'expo-local-authentication'
import { useState } from 'react'
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NumberStepper } from '@/components/form'
import { Money } from '@/components/money'
import { Segmented } from '@/components/segmented'
import { ACCOUNT_TYPE_META } from '@/features/accounts/meta'
import { cancelOwnNotifications } from '@/lib/notifications'
import { usePrefs } from '@/lib/prefs'
import { useProfile } from '@/lib/profile'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { useTheme, type ThemePreference } from '@/lib/theme'

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { colors, preference, setPreference } = useTheme()
  const { user } = useSession()
  const { userId, currency, grouping, timeZone, hideAmounts, appLock } = useProfile()
  const db = usePowerSync()
  const toast = useToast()
  const { data: issues } = useQuery<{ n: number }>('select count(*) as n from upload_issues')
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const signOut = async (wipe: boolean) => {
    await cancelOwnNotifications().catch(() => {})
    if (wipe) await db.disconnectAndClear().catch(() => {})
    const { error } = await supabase.auth.signOut()
    if (error) await supabase.auth.signOut({ scope: 'local' })
  }
  const { data: accounts } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const { prefs, update } = usePrefs()
  const nudgeHour = Number(prefs.nudgeTime.slice(0, 2))

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="-ml-2 h-11 w-11 items-center justify-center">
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginBottom: 20 }}>
        Settings
      </Text>

      <SectionTitle>Accounts</SectionTitle>
      <View className="rounded-card border border-border bg-surface px-3.5">
        {accounts.map((a, i) => {
          const meta = ACCOUNT_TYPE_META[a.type]
          return (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/account', params: { id: a.id } })}
              className="flex-row items-center py-3"
              style={[i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle }, a.archived ? { opacity: 0.5 } : null]}
            >
              <View className="h-9 w-9 items-center justify-center rounded-tile bg-surface-muted">
                <meta.icon size={17} color={colors.text} />
              </View>
              <View className="ml-3 flex-1">
                <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>{a.name}</Text>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>{a.archived ? 'Archived' : meta.label}</Text>
              </View>
              <Money minor={a.balance_minor} currency={currency} grouping={grouping} size={14} weight="600" color={colors.text} />
              <ChevronRight size={16} color={colors.textFaint} style={{ marginLeft: 6 }} />
            </Pressable>
          )
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account')}
          className="flex-row items-center py-3"
          style={accounts.length > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}
        >
          <View className="h-9 w-9 items-center justify-center rounded-tile bg-surface-muted">
            <Plus size={17} color={colors.text} />
          </View>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600', marginLeft: 12 }}>Add account</Text>
        </Pressable>
      </View>

      <SectionTitle>Money</SectionTitle>
      <View className="rounded-card border border-border bg-surface p-3.5">
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 6 }}>Currency</Text>
        <View className="flex-row flex-wrap gap-2">
          {['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR'].map((c) => (
            <Chip key={c} size="sm" label={c} selected={currency === c} onPress={() => void saveProfile(db, userId, { base_currency: c })} />
          ))}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 14, marginBottom: 6 }}>Number style</Text>
        <Segmented
          value={grouping}
          onChange={(g) => void saveProfile(db, userId, { number_grouping: g })}
          options={[
            { value: 'south_asian', label: '2,48,350' },
            { value: 'western', label: '248,350' },
          ]}
        />
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 14, marginBottom: 6 }}>Time zone · {timeZone}</Text>
        <View className="flex-row flex-wrap gap-2">
          {[...new Set([deviceTz, 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'])].map((tz) => (
            <Chip key={tz} size="sm" label={tz.split('/').pop()!.replace('_', ' ')} selected={timeZone === tz} onPress={() => void saveProfile(db, userId, { timezone: tz })} />
          ))}
        </View>
      </View>

      <SectionTitle>Privacy</SectionTitle>
      <View className="rounded-card border border-border bg-surface px-3.5">
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>Hide amounts</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>Or tap the balance card. Handy when people are around.</Text>
          </View>
          <Switch value={hideAmounts} onValueChange={(v) => void saveProfile(db, userId, { hide_amounts: v })} trackColor={{ true: colors.brand }} accessibilityLabel="Hide amounts" />
        </View>
        <View className="flex-row items-center justify-between py-3" style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>App lock</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>Fingerprint, face or device PIN when opening Hisab</Text>
          </View>
          <Switch
            value={appLock}
            trackColor={{ true: colors.brand }}
            accessibilityLabel="App lock"
            onValueChange={async (v) => {
              if (v) {
                const level = await LocalAuthentication.getEnrolledLevelAsync()
                if (level === LocalAuthentication.SecurityLevel.NONE) return toast({ message: 'Set a screen lock on your phone first.' })
                const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on app lock' })
                if (!r.success) return
              }
              await saveProfile(db, userId, { app_lock_enabled: v })
            }}
          />
        </View>
      </View>

      {(issues[0]?.n ?? 0) > 0 && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/issues')} className="mt-5 flex-row items-center gap-3 rounded-card border border-border bg-surface p-3.5">
          <AlertTriangle size={18} color={colors.warning} />
          <Text style={{ color: colors.text, fontSize: 14.5, flex: 1 }}>{issues[0]!.n} change{issues[0]!.n === 1 ? '' : 's'} couldn’t sync</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
      )}

      <SectionTitle>Reminders</SectionTitle>
      <View className="rounded-card border border-border bg-surface px-3.5">
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>Daily nudge</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>Only if you haven’t logged anything that day</Text>
          </View>
          <Switch value={prefs.nudgeEnabled} onValueChange={(v) => update({ nudgeEnabled: v })} trackColor={{ true: colors.brand }} accessibilityLabel="Daily nudge" />
        </View>
        {prefs.nudgeEnabled && (
          <View className="pb-3">
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 6 }}>
              At {String(nudgeHour % 12 || 12)}:00 {nudgeHour < 12 ? 'AM' : 'PM'}
            </Text>
            <NumberStepper value={nudgeHour} min={6} max={23} onChange={(h) => update({ nudgeTime: `${String(h).padStart(2, '0')}:00` })} />
          </View>
        )}
        <View className="py-3" style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>Remind about money owed every</Text>
          <Text style={{ color: colors.textFaint, fontSize: 12, marginBottom: 6 }}>{prefs.reminderIntervalDays} days after the due date</Text>
          <NumberStepper value={prefs.reminderIntervalDays} min={1} max={30} onChange={(n) => update({ reminderIntervalDays: n })} />
        </View>
      </View>

      <SectionTitle>Appearance</SectionTitle>
      <Segmented<ThemePreference>
        value={preference}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={setPreference}
      />

      <SectionTitle>Signed in</SectionTitle>
      <View className="rounded-card border border-border bg-surface px-3.5">
        <Text style={{ color: colors.textMuted, fontSize: 13.5, paddingVertical: 12 }}>{user?.email}</Text>
        <Pressable accessibilityRole="button" onPress={() => void signOut(false)} className="flex-row items-center gap-2 py-3" style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
          <LogOut size={17} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut(true)} className="py-3" style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>Sign out and remove data from this phone</Text>
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>Changes not yet synced will be lost</Text>
        </Pressable>
      </View>

      <SectionTitle>Danger zone</SectionTitle>
      <View className="rounded-card border border-border bg-surface p-3.5">
        {!deleting ? (
          <Pressable accessibilityRole="button" onPress={() => setDeleting(true)}>
            <Text style={{ color: colors.danger, fontSize: 14.5, fontWeight: '600' }}>Delete my account</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>Permanently deletes your account and all your data.</Text>
          </Pressable>
        ) : (
          <View>
            <Text style={{ color: colors.text, fontSize: 14, marginBottom: 8 }}>Type DELETE to permanently delete your account and all data. This can’t be undone.</Text>
            <TextInput
              accessibilityLabel="Type DELETE"
              autoCapitalize="characters"
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textFaint}
              className="h-11 rounded-[12px] border border-border px-3"
              style={{ color: colors.text, fontSize: 15 }}
            />
            <View className="mt-3 flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" onPress={() => (setDeleting(false), setConfirmText(''))}>
                  Cancel
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  disabled={confirmText !== 'DELETE'}
                  onPress={async () => {
                    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
                    if (error) return toast({ message: 'Couldn’t delete the account. Check your connection and try again.' })
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
    </ScrollView>
  )
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme()
  return (
    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 }}>
      {children}
    </Text>
  )
}
