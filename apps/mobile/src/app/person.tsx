import { formatMoney, isoInstant, lendingStatus, localDate, reminderMessage, smsUrl, toE164, whatsappUrl } from '@hisab/core'
import { closeLending, deleteLending, logReminderSent, QL, restoreLending, restoreTransaction, softDeleteTransaction, updateParty, type LendingView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { ChevronLeft, MessageCircle, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { formatDay } from '@/components/form'
import { Money } from '@/components/money'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

type Party = { id: string; name: string; kind: 'person' | 'company'; phone: string | null; note: string | null }
type HistoryRow = { id: string; type: string; amount_minor: number; occurred_on: string; note: string | null; lending_id: string | null; category_name: string | null; account_name: string | null }

/** Person detail (spec §7.3): who owes whom, one-tap WhatsApp/SMS reminder, Got paid, full history. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone, hideAmounts } = useProfile()
  const shown = (minor: number) => (hideAmounts ? `${currency} ••••` : formatMoney(minor, currency, { grouping }).text)
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { data: partyRows } = useQuery<Party>(QL.partyById, [id])
  const { data: lendings } = useQuery<LendingView>(QL.lendingsForParty, [id])
  const { data: reminders } = useQuery<{ id: string; channel: string; sent_at: string }>(QL.remindersForParty, [id])
  const { data: history } = useQuery<HistoryRow>(QL.partyHistory, [id])
  const party = partyRows[0]

  const open = useMemo(
    () =>
      lendings
        .map((l) => ({ l, ...lendingStatus(l, l.repaid, today) }))
        .filter((x) => x.status !== 'settled'),
    [lendings, today],
  )
  const owedToMe = open.filter((x) => x.l.direction === 'lent').reduce((s, x) => s + x.outstanding, 0)
  const iOwe = open.filter((x) => x.l.direction === 'borrowed').reduce((s, x) => s + x.outstanding, 0)
  const direction = owedToMe > 0 ? 'lent' : iOwe > 0 ? 'borrowed' : null
  const focus = open.filter((x) => x.l.direction === direction).sort((a, b) => (a.l.started_on < b.l.started_on ? -1 : 1))[0]
  const overdue = open.find((x) => x.l.direction === direction && x.status === 'overdue')

  const [message, setMessage] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [editingPhone, setEditingPhone] = useState(false)

  useEffect(() => {
    if (!party || !focus || !direction) return
    setMessage(
      reminderMessage({
        name: party.name.split(' ')[0]!,
        amount: formatMoney(direction === 'lent' ? owedToMe : iOwe, currency, { grouping }).text,
        startedOn: focus.l.started_on,
        direction,
      }),
    )
    // Regenerate only when the amount or person changes, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.name, focus?.l.id, owedToMe, iOwe, direction, currency, grouping])

  if (!party) return null

  const send = async (channel: 'whatsapp' | 'sms') => {
    if (!party.phone || !focus) return
    const url = channel === 'whatsapp' ? whatsappUrl(party.phone, message) : smsUrl(party.phone, message)
    try {
      await Linking.openURL(url)
      await logReminderSent(db, userId, focus.l.id, channel)
      void Haptics.selectionAsync()
    } catch {
      toast({ message: channel === 'whatsapp' ? 'WhatsApp isn’t installed — try SMS.' : 'Couldn’t open messages.' })
    }
  }

  const savePhone = async () => {
    const e164 = toE164(phoneDraft)
    if (!e164) return setPhoneError('Enter a phone number like 01712-345678')
    await updateParty(db, party.id, { name: party.name, kind: party.kind, phone: e164, note: party.note })
    setPhoneDraft('')
    setPhoneError(null)
    setEditingPhone(false)
  }

  return (
    <ScrollView style={{ backgroundColor: colors.page }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="-ml-2 h-11 w-11 items-center justify-center">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add lending"
          onPress={() => router.push({ pathname: '/lend', params: { party: party.id } })}
          className="h-11 w-11 items-center justify-center"
        >
          <Plus size={20} color={colors.text} />
        </Pressable>
      </View>

      <View className="mb-4 flex-row items-center gap-3">
        <Avatar name={party.name} size={46} />
        <View className="flex-1">
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>
            {party.name}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change phone number" onPress={() => setEditingPhone(true)} hitSlop={6}>
            <Text style={{ color: colors.textFaint, fontSize: 12.5 }}>{party.phone ? `${maskPhone(party.phone)} · change` : 'No phone number'}</Text>
          </Pressable>
        </View>
      </View>

      {direction ? (
        <View className="rounded-card border border-border bg-surface p-4">
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{direction === 'lent' ? `${party.name.split(' ')[0]} owes you` : `You owe ${party.name.split(' ')[0]}`}</Text>
          <Money
            minor={direction === 'lent' ? owedToMe : iOwe}
            currency={currency}
            grouping={grouping}
            size={28}
            weight="700"
            color={direction === 'lent' ? colors.positive : colors.text}
          />
          {direction === 'lent' && iOwe > 0 && (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/repay', params: { party: party.id, direction: 'borrowed' } })}>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
                You also owe {shown(iOwe)} · <Text style={{ fontWeight: '600', color: colors.text }}>Paid back</Text>
              </Text>
            </Pressable>
          )}
          {overdue?.l.due_on ? (
            <Text style={{ color: colors.warning, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>
              ● Was due {formatDay(overdue.l.due_on)} · {Math.round((Date.parse(today) - Date.parse(overdue.l.due_on)) / 86_400_000)} days overdue
            </Text>
          ) : focus?.l.due_on ? (
            <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>Due {formatDay(focus.l.due_on)}</Text>
          ) : null}

          <View className="mt-4 flex-row gap-2">
            {party.phone && (
              <>
                <ActionButton label="WhatsApp" icon={<MessageCircle size={17} color="#FFFFFF" />} bg="#1DA851" fg="#FFFFFF" onPress={() => void send('whatsapp')} />
                <ActionButton label="SMS" icon={<MessageSquareText size={17} color={colors.text} />} bg={colors.surfaceMuted} fg={colors.text} onPress={() => void send('sms')} />
              </>
            )}
            <ActionButton
              label={direction === 'lent' ? 'Got paid' : 'Paid back'}
              bg={colors.brand}
              fg={colors.brandFg}
              onPress={() => router.push({ pathname: '/repay', params: { party: party.id, direction } })}
            />
          </View>

          {party.phone && !editingPhone ? (
            <View className="mt-4 rounded-[14px] bg-surface-muted p-3">
              <Text style={{ color: colors.textFaint, fontSize: 11.5, marginBottom: 4 }}>Message (edit before sending)</Text>
              <TextInput
                accessibilityLabel="Reminder message"
                multiline
                value={message}
                onChangeText={setMessage}
                style={{ color: colors.text, fontSize: 14, lineHeight: 20, minHeight: 60, textAlignVertical: 'top' }}
              />
            </View>
          ) : (
            <View className="mt-4 gap-2">
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Add {party.name.split(' ')[0]}’s number to send a WhatsApp / SMS reminder.</Text>
              <View className="flex-row gap-2">
                <TextInput
                  accessibilityLabel="Phone number"
                  keyboardType="phone-pad"
                  value={phoneDraft}
                  onChangeText={(v) => (setPhoneDraft(v), setPhoneError(null))}
                  placeholder="01712-345678"
                  placeholderTextColor={colors.textFaint}
                  className="h-11 flex-1 rounded-[12px] bg-surface-muted px-3"
                  style={{ color: colors.text, fontSize: 15 }}
                />
                <Button variant="secondary" onPress={() => void savePhone()}>
                  Save
                </Button>
              </View>
              {phoneError && <Text style={{ color: colors.danger, fontSize: 12.5 }}>{phoneError}</Text>}
            </View>
          )}
        </View>
      ) : (
        <View className="rounded-card border border-border bg-surface p-4">
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>All settled ✓</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Nothing owed either way.</Text>
        </View>
      )}

      {lendings.length > 0 && (
        <>
          <SectionTitle>Lendings</SectionTitle>
          <View className="rounded-card border border-border bg-surface px-3.5">
            {lendings.map((l, i) => {
              const st = lendingStatus(l, l.repaid, today)
              return (
                <View key={l.id} className="flex-row items-center py-3" style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
                  <View className="flex-1">
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
                      {l.direction === 'lent' ? 'Lent' : 'Borrowed'} · {formatDay(l.started_on)}
                    </Text>
                    <Text style={{ color: st.status === 'overdue' ? colors.warning : colors.textFaint, fontSize: 12 }}>
                      {st.status === 'settled' ? 'Settled' : st.status === 'overdue' ? '● Overdue' : st.status === 'partly_paid' ? 'Partly paid' : l.due_on ? `Due ${formatDay(l.due_on)}` : 'Open'}
                      {l.repaid > 0 ? ` · ${shown(l.repaid)} back` : ''}
                    </Text>
                  </View>
                  <Money minor={l.principal_minor} currency={currency} grouping={grouping} hideCode size={14} weight="600" color={st.status === 'settled' ? colors.textFaint : colors.text} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit lending" hitSlop={8} onPress={() => router.push({ pathname: '/lend', params: { edit: l.id } })} className="ml-2 h-8 w-8 items-center justify-center">
                    <Pencil size={14} color={colors.textFaint} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete lending"
                    hitSlop={8}
                    onPress={async () => {
                      await deleteLending(db, l.id)
                      toast({ message: 'Lending deleted', onUndo: () => restoreLending(db, l.id) })
                    }}
                    className="h-8 w-8 items-center justify-center"
                  >
                    <Trash2 size={14} color={colors.textFaint} />
                  </Pressable>
                  {st.status !== 'settled' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Mark settled"
                      hitSlop={8}
                      onPress={async () => {
                        await closeLending(db, l.id, true)
                        toast({ message: 'Marked settled', onUndo: () => closeLending(db, l.id, false) })
                      }}
                      className="ml-2 h-8 items-center justify-center rounded-full bg-surface-muted px-2.5"
                    >
                      <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: '600' }}>Settle</Text>
                    </Pressable>
                  )}
                </View>
              )
            })}
          </View>
        </>
      )}

      {(history.length > 0 || reminders.length > 0) && (
        <>
          <SectionTitle>History</SectionTitle>
          <View className="rounded-card border border-border bg-surface px-3.5">
            {[
              ...history.map((h) => ({ kind: 'tx' as const, day: h.occurred_on, h })),
              ...reminders.map((r) => ({ kind: 'reminder' as const, day: localDate(new Date(isoInstant(r.sent_at)), timeZone), r })),
            ]
              .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
              .map((row, i) => (
                <View key={row.kind === 'tx' ? row.h.id : row.r.id} className="flex-row items-center py-3" style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined}>
                  <View className="flex-1">
                    <Text style={{ color: colors.text, fontSize: 14 }}>{row.kind === 'tx' ? historyLabel(row.h) : `Reminded via ${row.r.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}</Text>
                    <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                      {formatDay(row.day)}
                      {row.kind === 'tx' && row.h.account_name ? ` · ${row.h.account_name}` : ''}
                    </Text>
                  </View>
                  {row.kind === 'tx' && (
                    <>
                      <Money
                        minor={row.h.type === 'lending_in' || row.h.type === 'income' ? row.h.amount_minor : -row.h.amount_minor}
                        currency={currency}
                        grouping={grouping}
                        sign="always"
                        hideCode
                        size={14}
                        weight="600"
                        color={row.h.type === 'lending_in' || row.h.type === 'income' ? colors.positive : colors.text}
                      />
                      {(row.h.type === 'lending_in' || row.h.type === 'lending_out') && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Delete"
                          hitSlop={8}
                          onPress={async () => {
                            await softDeleteTransaction(db, row.h.id)
                            toast({ message: 'Deleted', onUndo: () => restoreTransaction(db, row.h.id) })
                          }}
                          className="ml-2 h-8 w-8 items-center justify-center"
                        >
                          <Trash2 size={15} color={colors.textFaint} />
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

function historyLabel(h: HistoryRow): string {
  switch (h.type) {
    case 'lending_out':
      return h.note || 'Money given'
    case 'lending_in':
      return h.note || 'Money received'
    case 'income':
      return h.note || h.category_name || 'Income'
    default:
      return h.note || h.category_name || 'Payment'
  }
}

function ActionButton({ label, icon, bg, fg, onPress }: { label: string; icon?: React.ReactNode; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[12px]"
      style={({ pressed }) => ({ backgroundColor: bg, opacity: pressed ? 0.85 : 1 })}
    >
      {icon}
      <Text style={{ color: fg, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme()
  return <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 }}>{children}</Text>
}

/** +8801712345621 → +880 17•• ••••21 */
function maskPhone(e164: string): string {
  if (e164.length < 8) return e164
  return `${e164.slice(0, 4)} ${e164.slice(4, 6)}•• ••••${e164.slice(-2)}`
}
