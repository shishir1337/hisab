import { QL, type PersonWithBalance } from '@hisab/db'
import { useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { Plus, Search, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { shortDay } from '@/components/form'
import { PeopleArt } from '@/components/illustrations'
import { useArrivals, useListMotion } from '@/components/list-motion'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { Divider, EmptyState, Screen, SectionHeader } from '@/components/screen'
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
  const groups = [
    { title: 'Owe you', rows: filtered.filter((p) => p.owed_to_me > 0) },
    { title: 'You owe', rows: filtered.filter((p) => p.owed_to_me <= 0 && p.i_owe > 0) },
    { title: 'Settled', rows: filtered.filter((p) => p.owed_to_me <= 0 && p.i_owe <= 0) },
  ].filter((g) => g.rows.length > 0)
  const motion = useListMotion()
  // Keyed by group, so someone moving from "Owe you" to "Settled" animates into their new group.
  const placed = useMemo(() => groups.flatMap((g) => g.rows.map((p) => `${g.title}:${p.id}`)), [filtered])
  const arrived = useArrivals(placed, query.trim())

  const lend = (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Lend or borrow money"
      haptic="selection"
      feedback="scale"
      onPress={() => router.push('/lend')}
      hitSlop={4}
      style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <Plus size={16} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Lend</Text>
    </Press>
  )

  return (
    <Screen title="People" accessory={lend} compactAccessory={lend}>
      {(totals.owed > 0 || totals.owe > 0) && (
        <View style={{ marginBottom: 4, flexDirection: 'row', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 14 }}>
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>Owed to you</Text>
            <Money minor={totals.owed} currency={currency} grouping={grouping} size={19} weight="700" color={totals.owed > 0 ? colors.positive : colors.text} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: colors.borderSubtle }}>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>You owe</Text>
            <Money minor={totals.owe} currency={currency} grouping={grouping} size={19} weight="700" color={colors.text} />
          </View>
        </View>
      )}

      {people.length > 4 && (
        <View style={{ marginTop: 12, height: 46, flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4 }}>
          <Search size={17} color={colors.textFaint} />
          <TextInput
            accessibilityLabel="Search people"
            value={query}
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, height: '100%', marginLeft: 10, color: colors.text, fontSize: 15 }}
          />
          {query ? (
            <Press accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={colors.textMuted} />
            </Press>
          ) : null}
        </View>
      )}

      {people.length === 0 ? (
        <EmptyState
          art={<PeopleArt />}
          title="Lent someone money?"
          description="Note it here — Hisab reminds you, and sends them a polite WhatsApp nudge in one tap."
          action={<Button onPress={() => router.push('/lend')}>Add a lending</Button>}
        />
      ) : groups.length === 0 ? (
        <View style={{ marginTop: 16 }}>
          <EmptyState title="No one by that name" description="Check the spelling, or add them with Lend." />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.title}>
            <SectionHeader title={g.title} right={<Text style={{ color: colors.textFaint, fontSize: 13 }}>{g.rows.length}</Text>} />
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
              {g.rows.map((p, i) => {
                const owes = p.owed_to_me > 0
                const owed = p.i_owe > 0
                const overdue = (owes || owed) && p.next_due !== null && p.next_due < today
                const meta = overdue
                  ? `Overdue · since ${shortDay(p.next_due!, today)}`
                  : p.next_due && (owes || owed)
                    ? `Due ${shortDay(p.next_due, today)}`
                    : owes || owed
                      ? 'No due date'
                      : p.kind === 'company'
                        ? 'Company'
                        : 'All settled'
                return (
                  <Animated.View key={p.id} entering={arrived.has(`${g.title}:${p.id}`) ? motion.entering : undefined} exiting={motion.exiting} layout={motion.layout}>
                    {i > 0 && <Divider inset={52} />}
                    <Press
                      accessibilityRole="button"
                      accessibilityHint="Opens their balance and history"
                      onPress={() => router.push({ pathname: '/person', params: { id: p.id } })}
                      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 12 }}
                    >
                      <Avatar name={p.name} size={40} />
                      <View style={{ flex: 1, marginLeft: 12, marginRight: 10 }}>
                        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                          {p.name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: overdue ? colors.danger : colors.textFaint, fontSize: 12.5, marginTop: 2, fontWeight: overdue ? '600' : '400' }}>
                          {meta}
                        </Text>
                      </View>
                      {(owes || owed) && (
                        <Money minor={owes ? p.owed_to_me : p.i_owe} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={owes ? colors.positive : colors.text} />
                      )}
                    </Press>
                  </Animated.View>
                )
              })}
            </View>
          </View>
        ))
      )}
    </Screen>
  )
}
