import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { addDays, convertFx, dayLabel, formatMoney, keypadToMinor, rankCategories, rankSuggestions, type SuggestionRow } from '@hisab/core'
import {
  createParty,
  createTransaction,
  Q,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
  ValidationError,
  type CategoryOption,
  type TransactionDraft,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { Calendar, ChevronLeft, ChevronRight, Globe, Plus, StickyNote, Trash2, User, Wallet, X } from 'lucide-react-native'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { IconTile } from '@/components/icon-tile'
import { Keypad } from '@/components/keypad'
import { Money } from '@/components/money'
import { Segmented } from '@/components/segmented'
import { useProfile, useToday } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'
import { formReducer, initialForm, toDraft, type QuickLogType } from './form'
import type { OpenOptions } from './provider'

type Panel = 'none' | 'categories' | 'account' | 'toAccount' | 'day' | 'note' | 'party' | 'fx'
type AccountOption = { id: string; name: string; type: string }

const FX_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'MYR', 'SGD', 'CAD', 'AUD', 'INR']
const MISSING_HINT = {
  amount: 'Enter an amount',
  category: 'Pick a category',
  account: 'Add an account first (Settings → Accounts)',
  toAccount: 'Pick the account to move money to',
  rate: 'Enter the exchange rate you got',
} as const

export function QuickLogSheet({ options, onDone }: { options: OpenOptions; onDone: () => void }) {
  const db = usePowerSync()
  const profile = useProfile()
  const today = useToday(profile.timeZone)
  const { colors } = useTheme()
  const toast = useToast()

  const { data: accounts } = useQuery<AccountOption>(Q.activeAccounts)
  const [form, dispatch] = useReducer(formReducer, undefined, () => initialForm({ today, accountId: null }))
  const kind = form.type === 'income' ? 'income' : 'expense'
  const { data: categories } = useQuery<CategoryOption>(Q.categories, [kind])
  const { data: parties } = useQuery<{ id: string; name: string }>(Q.parties)
  const { data: history } = useQuery<SuggestionRow>(Q.suggestionHistory, [addDays(today, -60)])

  const [panel, setPanel] = useState<Panel>('none')
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A ref (not state) so in-flight async lookups see the user's latest explicit choice.
  const accountTouched = useRef(false)
  const busy = useRef(false)
  const [newParty, setNewParty] = useState('')
  const editing = Boolean(form.editingId)

  // Load the transaction being edited, or default to the first account.
  useEffect(() => {
    if (options.edit) dispatch({ type: 'load', tx: options.edit })
    else if (options.type) dispatch({ type: 'setType', value: options.type })
  }, [options])
  useEffect(() => {
    if (!options.edit && !form.accountId && accounts[0]) dispatch({ type: 'setAccount', id: accounts[0].id })
  }, [accounts, form.accountId, options.edit])

  const now = new Date()
  const suggestions = useMemo(
    () => (form.type === 'expense' && !editing ? rankSuggestions(history, now, profile.timeZone) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, form.type, editing, profile.timeZone],
  )
  const topCategoryIds = useMemo(
    () => (kind === 'expense' ? rankCategories(history, now, profile.timeZone, categories) : categories.slice(0, 4).map((c) => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, categories, kind, profile.timeZone],
  )
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const account = accounts.find((a) => a.id === form.accountId)
  const toAccount = accounts.find((a) => a.id === form.toAccountId)
  const party = parties.find((p) => p.id === form.partyId)

  const typed = keypadToMinor(form.keypad)
  const fxAmount = form.fx && typed !== null && /^\d{1,12}(\.\d{1,8})?$/.test(form.fx.rate) ? safeFx(typed, form.fx.rate) : null

  const selectCategory = async (id: string) => {
    dispatch({ type: 'setCategory', id })
    setPanel('none')
    setHint(null)
    if (!accountTouched.current && !editing) {
      const last = await db.getOptional<{ account_id: string }>(Q.lastAccountForCategory, [id])
      if (!accountTouched.current && last && accounts.some((a) => a.id === last.account_id)) dispatch({ type: 'setAccount', id: last.account_id })
    }
  }

  const commit = async (draft: TransactionDraft, label: string) => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    try {
      if (editing && options.edit) {
        const before = options.edit
        await updateTransaction(db, form.editingId!, draft)
        toast({
          message: `Updated · ${label}`,
          onUndo: () =>
            updateTransaction(db, before.id, {
              type: before.type,
              amount_minor: before.amount_minor,
              account_id: before.account_id,
              to_account_id: before.to_account_id,
              category_id: before.category_id,
              party_id: before.party_id,
              occurred_on: before.occurred_on,
              occurred_at: before.occurred_at,
              note: before.note,
              original_amount_minor: before.original_amount_minor,
              original_currency: before.original_currency,
              fx_rate: before.fx_rate,
            }),
        })
      } else {
        const id = await createTransaction(db, profile.userId, draft)
        toast({ message: `Saved · ${label}`, onUndo: () => softDeleteTransaction(db, id) })
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onDone()
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setHint(e instanceof ValidationError ? (e.issues[0]?.message ?? 'Check the details') : 'Couldn’t save. Please try again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const save = () => {
    const r = toDraft(form, new Date(), profile.timeZone)
    if (!r.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setHint(MISSING_HINT[r.missing])
      if (r.missing === 'category') setPanel('categories')
      if (r.missing === 'toAccount') setPanel('toAccount')
      if (r.missing === 'rate') setPanel('fx')
      return
    }
    const name = form.type === 'transfer' ? 'Transfer' : (byId.get(form.categoryId!)?.name ?? '')
    void commit(r.draft, `${name} ${formatMoney(r.draft.amount_minor, profile.currency, { grouping: profile.grouping }).text}`)
  }

  const logSuggestion = (s: (typeof suggestions)[number]) => {
    if (busy.current) return
    const fallback = accounts.find((a) => a.id === form.accountId)?.id ?? accounts[0]?.id
    if (!fallback) return setHint(MISSING_HINT.account)
    const cat = byId.get(s.category_id)
    void (async () => {
      let accountId = fallback
      if (!accountTouched.current) {
        const last = await db.getOptional<{ account_id: string }>(Q.lastAccountForCategory, [s.category_id])
        if (last && accounts.some((a) => a.id === last.account_id)) accountId = last.account_id
      }
      // Same day/time rules as a normal save (respects a day picked in the day panel).
      const r = toDraft({ ...form, type: 'expense', keypad: '', categoryId: s.category_id, accountId, note: s.note ?? '', fx: null }, new Date(), profile.timeZone)
      const base = r.ok ? r.draft : null
      const draft: TransactionDraft = {
        type: 'expense',
        amount_minor: s.amount_minor,
        account_id: accountId,
        category_id: s.category_id,
        note: s.note,
        occurred_on: form.day,
        occurred_at: base?.occurred_at ?? new Date().toISOString(),
      }
      await commit(draft, `${s.note || cat?.name || ''} ${formatMoney(s.amount_minor, profile.currency, { grouping: profile.grouping }).text}`)
    })()
  }

  const remove = async () => {
    if (!form.editingId) return
    const id = form.editingId
    await softDeleteTransaction(db, id)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    toast({ message: 'Deleted', onUndo: () => restoreTransaction(db, id) })
    onDone()
  }

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))

  return (
    <View className="gap-3 pt-1">
      <Segmented<QuickLogType | 'lend'>
        value={form.type}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
          ...(editing ? [] : [{ value: 'lend' as const, label: 'Lend' }]),
        ]}
        onChange={(v) => {
          if (v === 'lend') {
            onDone()
            router.push('/lend')
            return
          }
          dispatch({ type: 'setType', value: v, otherAccountId: accounts.find((a) => a.id !== form.accountId)?.id ?? null })
          setPanel('none')
          setHint(null)
        }}
      />

      {/* Suggested now — one tap logs (spec §6.7) */}
      {suggestions.length > 0 && form.keypad === '' && (
        <View>
          <Text style={{ color: colors.textFaint, fontSize: 11.5, marginBottom: 6 }}>Suggested now · tap to log</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {suggestions.map((s) => {
              const c = byId.get(s.category_id)
              return (
                <Chip
                  key={`${s.category_id}-${s.amount_minor}-${s.note}`}
                  size="sm"
                  icon={<Text style={{ fontSize: 13 }}>{c?.icon ?? '•'}</Text>}
                  label={`${s.note || c?.name || ''} · ${formatMoney(s.amount_minor, profile.currency, { grouping: profile.grouping }).number}`}
                  onPress={() => logSuggestion(s)}
                />
              )
            })}
          </ScrollView>
        </View>
      )}

      {/* Amount */}
      <View className="items-center py-1">
        <Money
          minor={typed ?? 0}
          currency={form.fx ? form.fx.currency : profile.currency}
          grouping={profile.grouping}
          size={42}
          weight="700"
          color={typed === null ? colors.textFaint : colors.text}
        />
        {form.fx && (
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
            {fxAmount !== null ? `= ${formatMoney(fxAmount, profile.currency, { grouping: profile.grouping }).text}` : 'Enter the rate you got'}
          </Text>
        )}
      </View>

      {/* What: categories, or from → to for transfers */}
      {form.type === 'transfer' ? (
        <View className="flex-row items-center gap-2">
          <Chip label={account?.name ?? 'From'} icon={<Wallet size={14} color={colors.textMuted} />} selected={panel === 'account'} onPress={() => togglePanel('account')} />
          <ChevronRight size={16} color={colors.textFaint} />
          <Chip
            label={toAccount?.name ?? 'To account'}
            icon={<Wallet size={14} color={colors.textMuted} />}
            selected={panel === 'toAccount'}
            onPress={() => togglePanel('toAccount')}
          />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[...new Set([...(form.categoryId && !topCategoryIds.includes(form.categoryId) ? [form.categoryId] : []), ...topCategoryIds])].map((id) => {
            const c = byId.get(id)
            if (!c) return null
            return (
              <Chip
                key={id}
                label={c.name}
                icon={<Text style={{ fontSize: 14 }}>{c.icon}</Text>}
                selected={form.categoryId === id}
                onPress={() => void selectCategory(id)}
              />
            )
          })}
          <Chip label="More" selected={panel === 'categories'} onPress={() => togglePanel('categories')} />
        </ScrollView>
      )}

      {/* Inline panels */}
      {panel === 'categories' && (
        <View className="flex-row flex-wrap gap-2 rounded-[16px] bg-surface-muted p-3">
          {categories.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: form.categoryId === c.id }}
              onPress={() => void selectCategory(c.id)}
              className="w-[22%] items-center gap-1 py-1"
            >
              <IconTile icon={c.icon} tint={c.color} size={40} />
              <Text numberOfLines={1} style={{ fontSize: 11, color: form.categoryId === c.id ? colors.text : colors.textMuted, fontWeight: form.categoryId === c.id ? '700' : '500' }}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {(panel === 'account' || panel === 'toAccount') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {accounts
            .filter((a) => panel === 'account' || a.id !== form.accountId)
            .map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={(panel === 'account' ? form.accountId : form.toAccountId) === a.id}
                onPress={() => {
                  if (panel === 'account') {
                    dispatch({ type: 'setAccount', id: a.id })
                    accountTouched.current = true
                  } else dispatch({ type: 'setToAccount', id: a.id })
                  setPanel('none')
                  setHint(null)
                }}
              />
            ))}
        </ScrollView>
      )}
      {panel === 'day' && (
        <View className="flex-row items-center gap-2">
          <Chip label="Today" selected={form.day === today} onPress={() => dispatch({ type: 'setDay', day: today })} />
          <Chip label="Yesterday" selected={form.day === addDays(today, -1)} onPress={() => dispatch({ type: 'setDay', day: addDays(today, -1) })} />
          <View className="ml-auto flex-row items-center gap-1">
            <IconButton label="Previous day" onPress={() => dispatch({ type: 'setDay', day: addDays(form.day, -1) })}>
              <ChevronLeft size={18} color={colors.text} />
            </IconButton>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', minWidth: 78, textAlign: 'center' }}>{dayLabel(form.day, today)}</Text>
            <IconButton label="Next day" disabled={form.day >= today} onPress={() => dispatch({ type: 'setDay', day: addDays(form.day, 1) })}>
              <ChevronRight size={18} color={form.day >= today ? colors.textFaint : colors.text} />
            </IconButton>
          </View>
        </View>
      )}
      {panel === 'note' && (
        <BottomSheetTextInput
          autoFocus
          accessibilityLabel="Note"
          placeholder="Add a note (e.g. Tea at office)"
          placeholderTextColor={colors.textFaint}
          value={form.note}
          maxLength={500}
          onChangeText={(v) => dispatch({ type: 'setNote', value: v })}
          onSubmitEditing={() => setPanel('none')}
          returnKeyType="done"
          style={{ height: 46, borderRadius: 13, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.surfaceMuted }}
        />
      )}
      {panel === 'party' && (
        <View className="gap-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {form.partyId && <Chip label="None" onPress={() => dispatch({ type: 'setParty', id: null })} />}
            {parties.map((p) => (
              <Chip key={p.id} label={p.name} selected={form.partyId === p.id} onPress={() => (dispatch({ type: 'setParty', id: p.id }), setPanel('none'))} />
            ))}
          </ScrollView>
          <View className="flex-row items-center gap-2">
            <BottomSheetTextInput
              accessibilityLabel="New person or company"
              placeholder="New: Company A, client name…"
              placeholderTextColor={colors.textFaint}
              value={newParty}
              onChangeText={setNewParty}
              style={{ flex: 1, height: 42, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceMuted }}
            />
            <IconButton
              label="Add"
              onPress={async () => {
                if (!newParty.trim()) return
                const id = await createParty(db, profile.userId, { name: newParty.trim(), kind: 'company' })
                dispatch({ type: 'setParty', id })
                setNewParty('')
                setPanel('none')
              }}
            >
              <Plus size={18} color={colors.text} />
            </IconButton>
          </View>
        </View>
      )}
      {panel === 'fx' && form.fx && (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              dispatch({ type: 'toggleFx' })
              setPanel('none')
            }}
            className="flex-row items-center gap-1.5 self-start py-1"
            hitSlop={8}
          >
            <X size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Received in {profile.currency} instead</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FX_CURRENCIES.map((c) => (
              <Chip key={c} size="sm" label={c} selected={form.fx?.currency === c} onPress={() => dispatch({ type: 'setFxCurrency', value: c })} />
            ))}
          </ScrollView>
          <BottomSheetTextInput
            accessibilityLabel="Exchange rate"
            keyboardType="decimal-pad"
            placeholder={`Rate: 1 ${form.fx.currency} = ? ${profile.currency}`}
            placeholderTextColor={colors.textFaint}
            value={form.fx.rate}
            onChangeText={(v) => dispatch({ type: 'setFxRate', value: v })}
            style={{ height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surfaceMuted }}
          />
        </View>
      )}

      {/* Meta: account · day · note (· from · currency for income) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {form.type !== 'transfer' && (
          <Chip size="sm" icon={<Wallet size={13} color={colors.textMuted} />} label={account?.name ?? 'Account'} selected={panel === 'account'} onPress={() => togglePanel('account')} />
        )}
        <Chip size="sm" icon={<Calendar size={13} color={colors.textMuted} />} label={dayLabel(form.day, today)} selected={panel === 'day'} onPress={() => togglePanel('day')} />
        <Chip
          size="sm"
          icon={<StickyNote size={13} color={colors.textMuted} />}
          label={form.note.trim() ? truncate(form.note.trim(), 18) : 'Note'}
          selected={panel === 'note'}
          onPress={() => togglePanel('note')}
        />
        {form.type === 'income' && (
          <>
            <Chip size="sm" icon={<User size={13} color={colors.textMuted} />} label={party?.name ?? 'From'} selected={panel === 'party'} onPress={() => togglePanel('party')} />
            <Chip
              size="sm"
              icon={<Globe size={13} color={colors.textMuted} />}
              label={form.fx ? form.fx.currency : 'Other currency'}
              selected={panel === 'fx'}
              onPress={() => {
                if (!form.fx) dispatch({ type: 'toggleFx' })
                togglePanel('fx')
              }}
            />
          </>
        )}
      </ScrollView>

      {panel !== 'note' && panel !== 'party' && panel !== 'fx' && <Keypad onKey={(key) => (dispatch({ type: 'key', key }), setHint(null))} />}

      <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12.5, minHeight: 16, textAlign: 'center' }}>
        {hint ?? ''}
      </Text>

      <View className="flex-row gap-2">
        {editing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
            onPress={() => void remove()}
            className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-surface-muted"
          >
            <Trash2 size={20} color={colors.danger} />
          </Pressable>
        )}
        <View className="flex-1">
          <Button onPress={save} loading={saving}>
            {editing ? 'Save changes' : 'Save'}
          </Button>
        </View>
      </View>
    </View>
  )
}

function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={6} onPress={onPress} className="h-11 w-11 items-center justify-center rounded-[11px] bg-surface-muted">
      {children}
    </Pressable>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function safeFx(minor: number, rate: string): number | null {
  try {
    return convertFx(minor, rate)
  } catch {
    return null
  }
}
