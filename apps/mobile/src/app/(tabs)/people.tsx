import { QL, type PersonWithBalance } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { Plus, Search } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Avatar } from '@/components/avatar'
import { formatDay } from '@/components/form'
import { Money } from '@/components/money'
import { Screen } from '@/components/screen'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'

export default function PeopleScreen() {
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const { data: people } = useQuery<PersonWithBalance>(QL.peopleWithBalances)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people
  }, [people, query])
  const totals = people.reduce((t, p) => ({ owed: t.owed + p.owed_to_me, owe: t.owe + p.i_owe }), { owed: 0, owe: 0 })

  return (
    <Screen
      title="People"
      accessory={
        <Pressable accessibilityRole="button" accessibilityLabel="Lend or borrow money" onPress={() => router.push('/lend')} className="h-10 w-10 items-center justify-center rounded-full bg-brand">
          <Plus size={20} color={colors.brandFg} />
        </Pressable>
      }
    >
      {(totals.owed > 0 || totals.owe > 0) && (
        <View className="mb-4 flex-row rounded-card border border-border bg-surface p-4">
          <View className="flex-1">
            <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>Owed to you</Text>
            <Money minor={totals.owed} currency={currency} grouping={grouping} size={17} weight="700" color={totals.owed > 0 ? colors.positive : colors.text} />
          </View>
          <View className="flex-1 pl-3" style={{ borderLeftWidth: 1, borderLeftColor: colors.borderSubtle }}>
            <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>You owe</Text>
            <Money minor={totals.owe} currency={currency} grouping={grouping} size={17} weight="700" color={colors.text} />
          </View>
        </View>
      )}

      {people.length > 4 && (
        <View className="mb-3 h-11 flex-row items-center rounded-[12px] bg-surface-muted px-3">
          <Search size={16} color={colors.textFaint} />
          <TextInput
            accessibilityLabel="Search people"
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 15 }}
          />
        </View>
      )}

      {people.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/lend')} className="rounded-card border border-dashed border-border p-5">
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Lent someone money?</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }}>
            Note it here — Hisab reminds you, and sends them a polite WhatsApp nudge in one tap.
          </Text>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 12 }}>+ Add a lending</Text>
        </Pressable>
      ) : (
        <View className="rounded-card border border-border bg-surface px-3.5">
          {filtered.map((p, i) => {
            const overdue = p.next_due !== null && p.next_due < today
            const owes = p.owed_to_me > 0
            const owed = p.i_owe > 0
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/person', params: { id: p.id } })}
                className="flex-row items-center py-3"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}
              >
                <Avatar name={p.name} />
                <View className="ml-3 flex-1">
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>
                    {p.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: overdue ? colors.warning : colors.textFaint, fontSize: 12, fontWeight: overdue ? '600' : '400' }}>
                    {owes ? 'Owes you' : owed ? 'You owe' : p.kind === 'company' ? 'Company' : 'Settled'}
                    {p.next_due ? (overdue ? ` · ● overdue since ${formatDay(p.next_due)}` : ` · due ${formatDay(p.next_due)}`) : ''}
                  </Text>
                </View>
                {(owes || owed) && (
                  <Money minor={owes ? p.owed_to_me : p.i_owe} currency={currency} grouping={grouping} hideCode size={14.5} weight="600" color={owes ? colors.positive : colors.text} />
                )}
              </Pressable>
            )
          })}
        </View>
      )}
    </Screen>
  )
}
