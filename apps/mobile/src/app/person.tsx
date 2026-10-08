import { formatMoney, isoInstant, lendingStatus, localDate, reminderMessage, smsUrl, toE164, whatsappUrl } from '@hisab/core'
import { closeLending, deleteLending, logReminderSent, QL, restoreLending, restoreTransaction, softDeleteTransaction, updateParty, type LendingView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { Check, MessageCircle, MessageSquareText, Plus, Trash2 } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Linking, Text, TextInput, View } from 'react-native'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { shortDay, TextField } from '@/components/form'
import { Money } from '@/components/money'
import { Press } from '@/components/press'
import { BarButton, Divider, SectionHeader, StackScreen } from '@/components/screen'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'

type Party = { id: string; name: string; kind: 'person' | 'company'; phone: string | null; note: string | null }
type HistoryRow = { id: string; type: string; amount_minor: number; occurred_on: string; note: string | null; lending_id: string | null; category_name: string | null; account_name: string | null }

/** WhatsApp's own green on its icon only — the button itself stays neutral. */
const WHATSAPP = '#1DA851'

/** Person detail (spec §7.3): who owes whom, one-tap WhatsApp/SMS reminder, Got paid, full history. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone, hideAmounts } = useProfile()
  const shown = (minor: number) => (hideAmounts ? `${currency} ••••` : formatMoney(minor, currency, { grouping }).text)
  const today = useToday(timeZone)
  const { colors } = useTheme()
  const toast = useToast()
  const { data: partyRows } = useQuery<Party>(QL.partyById, [id])
  const { data: lendings } = useQuery<LendingView>(QL.lendingsForParty, [id])
  const { data: reminders } = useQuery<{ id: string; channel: string; sent_at: string }>(QL.remindersForParty, [id])
  const { data: historyRows } = useQuery<HistoryRow>(QL.partyHistory, [id])
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

  if (!party) return <View style={{ flex: 1, backgroundColor: colors.page }} />

  const send = async (channel: 'whatsapp' | 'sms') => {
    if (!party.phone || !focus) return
    const url = channel === 'whatsapp' ? whatsappUrl(party.phone, message) : smsUrl(party.phone, message)
    try {
      await Linking.openURL(url)
      await logReminderSent(db, userId, focus.l.id, channel)
      void Haptics.selectionAsync()
    } catch {
      toast({ message: channel === 'whatsapp' ? 'WhatsApp isn’t installed — try SMS.' : 'Couldn’t open messages.', kind: 'error' })
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

  const first = party.name.split(' ')[0]
  const history = [
    ...historyRows.map((h) => ({ kind: 'tx' as const, day: h.occurred_on, h })),
    ...reminders.map((r) => ({ kind: 'reminder' as const, day: localDate(new Date(isoInstant(r.sent_at)), timeZone), r })),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  const overdueDays = overdue?.l.due_on ? Math.round((Date.parse(today) - Date.parse(overdue.l.due_on)) / 86_400_000) : 0
  const card = { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface } as const

  return (
    <StackScreen
      title={party.name}
      actions={
        <BarButton label="Add lending" onPress={() => router.push({ pathname: '/lend', params: { party: party.id } })}>
          <Plus size={22} color={colors.text} />
        </BarButton>
      }
      hero={
        <View style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={party.name} size={52} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={2} style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
              {party.name}
            </Text>
            <Press
              accessibilityRole="button"
              accessibilityLabel={party.phone ? 'Change phone number' : 'Add phone number'}
              onPress={() => setEditingPhone(true)}
              hitSlop={10}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13.5 }}>
                {party.phone ? maskPhone(party.phone) : 'No phone number'}
                <Text style={{ color: colors.text, fontWeight: '600' }}>{party.phone ? '  ·  Change' : '  ·  Add'}</Text>
              </Text>
            </Press>
          </View>
        </View>
      }
    >
      {direction ? (
        <View style={{ ...card, padding: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>{direction === 'lent' ? `${first} owes you` : `You owe ${first}`}</Text>
          <View style={{ marginTop: 2 }}>
            <Money minor={direction === 'lent' ? owedToMe : iOwe} currency={currency} grouping={grouping} size={30} weight="700" color={direction === 'lent' ? colors.positive : colors.text} />
          </View>
          {overdue?.l.due_on ? (
            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
              Overdue · was due {shortDay(overdue.l.due_on, today)} ({overdueDays} {overdueDays === 1 ? 'day' : 'days'} ago)
            </Text>
          ) : focus?.l.due_on ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Due {shortDay(focus.l.due_on, today)}</Text>
          ) : null}
          {direction === 'lent' && iOwe > 0 && (
            <Press
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/repay', params: { party: party.id, direction: 'borrowed' } })}
              hitSlop={8}
              style={{ marginTop: 6, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                You also owe {shown(iOwe)} · <Text style={{ fontWeight: '600', color: colors.text }}>Paid back</Text>
              </Text>
            </Press>
          )}

          <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
            {party.phone && (
              <>
                <ActionButton label="WhatsApp" icon={<MessageCircle size={17} color={WHATSAPP} />} bg={colors.surfaceMuted} fg={colors.text} onPress={() => void send('whatsapp')} />
                <ActionButton label="SMS" icon={<MessageSquareText size={17} color={colors.textMuted} />} bg={colors.surfaceMuted} fg={colors.text} onPress={() => void send('sms')} />
              </>
            )}
            <ActionButton
              label={direction === 'lent' ? 'Got paid' : 'Paid back'}
              icon={<Check size={17} color={colors.brandFg} strokeWidth={2.4} />}
              bg={colors.brand}
              fg={colors.brandFg}
              onPress={() => router.push({ pathname: '/repay', params: { party: party.id, direction } })}
            />
          </View>

          {party.phone && !editingPhone ? (
            <View style={{ marginTop: 14, borderRadius: 14, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: colors.textFaint, fontSize: 12, marginBottom: 4 }}>Reminder message · edit before sending</Text>
              <TextInput
                accessibilityLabel="Reminder message"
                multiline
                value={message}
                onChangeText={setMessage}
                style={{ color: colors.text, fontSize: 14.5, lineHeight: 21, minHeight: 64, padding: 0, textAlignVertical: 'top' }}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
            <Check size={18} color={colors.positive} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>All settled</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>Nothing owed either way.</Text>
          </View>
        </View>
      )}

      {(editingPhone || (direction !== null && !party.phone)) && (
        <View style={{ ...card, marginTop: 12, padding: 16 }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{party.phone ? 'Change phone number' : `Add ${first}’s number`}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: 12 }}>For one-tap WhatsApp and SMS reminders.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <TextField
                accessibilityLabel="Phone number"
                keyboardType="phone-pad"
                value={phoneDraft}
                onChangeText={(v) => (setPhoneDraft(v), setPhoneError(null))}
                placeholder="01712-345678"
                invalid={Boolean(phoneError)}
              />
            </View>
            <Button variant="secondary" onPress={() => void savePhone()}>
              Save
            </Button>
          </View>
          {phoneError ? <Text style={{ color: colors.danger, fontSize: 12.5, marginTop: 6 }}>{phoneError}</Text> : null}
          {editingPhone && (
            <Press
              accessibilityRole="button"
              onPress={() => (setEditingPhone(false), setPhoneError(null), setPhoneDraft(''))}
              hitSlop={10}
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13.5, fontWeight: '500' }}>Cancel</Text>
            </Press>
          )}
        </View>
      )}

      {lendings.length > 0 && (
        <>
          <SectionHeader title="Lendings" />
          <View style={{ ...card, paddingHorizontal: 14 }}>
            {lendings.map((l, i) => {
              const st = lendingStatus(l, l.repaid, today)
              const settled = st.status === 'settled'
              return (
                <View key={l.id}>
                  {i > 0 && <Divider />}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Press
                      accessibilityRole="button"
                      accessibilityHint="Edit this lending"
                      onPress={() => router.push({ pathname: '/lend', params: { edit: l.id } })}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 12 }}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text numberOfLines={1} style={{ color: settled ? colors.textMuted : colors.text, fontSize: 15, fontWeight: '500' }}>
                          {l.direction === 'lent' ? 'Lent' : 'Borrowed'} · {shortDay(l.started_on, today)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{ color: st.status === 'overdue' ? colors.danger : colors.textFaint, fontSize: 12.5, marginTop: 2, fontWeight: st.status === 'overdue' ? '600' : '400' }}
                        >
                          {settled ? 'Settled' : st.status === 'overdue' ? 'Overdue' : st.status === 'partly_paid' ? 'Partly paid' : l.due_on ? `Due ${shortDay(l.due_on, today)}` : 'Open'}
                          {l.repaid > 0 ? ` · ${shown(l.repaid)} back` : ''}
                        </Text>
                      </View>
                      <Money minor={l.principal_minor} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={settled ? colors.textFaint : colors.text} />
                    </Press>
                    {!settled && (
                      <Press
                        accessibilityRole="button"
                        accessibilityLabel="Mark settled"
                        hitSlop={6}
                        feedback="scale"
                        onPress={async () => {
                          await closeLending(db, l.id, true)
                          toast({ message: 'Marked settled', onUndo: () => closeLending(db, l.id, false) })
                        }}
                        style={{ marginLeft: 10, height: 32, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
                      >
                        <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '600' }}>Settle</Text>
                      </Press>
                    )}
                    <Press
                      accessibilityRole="button"
                      accessibilityLabel="Delete lending"
                      onPress={async () => {
                        await deleteLending(db, l.id)
                        toast({ message: 'Lending deleted', onUndo: () => restoreLending(db, l.id) })
                      }}
                      style={{ marginRight: -8, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={16} color={colors.textFaint} />
                    </Press>
                  </View>
                </View>
              )
            })}
          </View>
        </>
      )}

      {history.length > 0 && (
        <>
          <SectionHeader title="History" />
          <View style={{ ...card, paddingHorizontal: 14 }}>
            {history.map((row, i) => {
              const inflow = row.kind === 'tx' && (row.h.type === 'lending_in' || row.h.type === 'income')
              return (
                <View key={row.kind === 'tx' ? row.h.id : row.r.id}>
                  {i > 0 && <Divider />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 12 }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text numberOfLines={1} style={{ color: row.kind === 'tx' ? colors.text : colors.textMuted, fontSize: 14.5, fontWeight: row.kind === 'tx' ? '500' : '400' }}>
                        {row.kind === 'tx' ? historyLabel(row.h) : `Reminded via ${row.r.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>
                        {shortDay(row.day, today)}
                        {row.kind === 'tx' && row.h.account_name ? ` · ${row.h.account_name}` : ''}
                      </Text>
                    </View>
                    {row.kind === 'tx' && (
                      <>
                        <Money
                          minor={inflow ? row.h.amount_minor : -row.h.amount_minor}
                          currency={currency}
                          grouping={grouping}
                          sign="always"
                          hideCode
                          size={15}
                          weight="600"
                          color={inflow ? colors.positive : colors.text}
                        />
                        {(row.h.type === 'lending_in' || row.h.type === 'lending_out') && (
                          <Press
                            accessibilityRole="button"
                            accessibilityLabel="Delete"
                            onPress={async () => {
                              await softDeleteTransaction(db, row.h.id)
                              toast({ message: 'Deleted', onUndo: () => restoreTransaction(db, row.h.id) })
                            }}
                            style={{ marginLeft: 2, marginRight: -8, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={16} color={colors.textFaint} />
                          </Press>
                        )}
                      </>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        </>
      )}
    </StackScreen>
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
    <Press
      accessibilityRole="button"
      haptic="selection"
      feedback="scale"
      onPress={onPress}
      style={{ height: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: bg }}
    >
      {icon}
      <Text numberOfLines={1} style={{ color: fg, fontSize: 14, fontWeight: '600' }}>
        {label}
      </Text>
    </Press>
  )
}

/** +8801712345621 → +880 17•• ••••21 */
function maskPhone(e164: string): string {
  if (e164.length < 8) return e164
  return `${e164.slice(0, 4)} ${e164.slice(4, 6)}•• ••••${e164.slice(-2)}`
}
