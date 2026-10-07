import { Q, type AccountWithBalance } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react-native'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NumberStepper } from '@/components/form'
import { Money } from '@/components/money'
import { Segmented } from '@/components/segmented'
import { ACCOUNT_TYPE_META } from '@/features/accounts/meta'
import { usePrefs } from '@/lib/prefs'
import { useProfile } from '@/lib/profile'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { useTheme, type ThemePreference } from '@/lib/theme'

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { colors, preference, setPreference } = useTheme()
  const { user } = useSession()
  const { currency, grouping } = useProfile()
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
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            // Local data stays on this device for this account (per-user database).
            const { error } = await supabase.auth.signOut()
            if (error) await supabase.auth.signOut({ scope: 'local' })
          }}
          className="flex-row items-center gap-2 py-3"
          style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}
        >
          <LogOut size={17} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 14.5, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
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
