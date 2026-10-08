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
  transactionInput,
  type TransactionDraft,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Calendar, ChevronLeft, ChevronRight, Globe, Plus, StickyNote, Trash2, User, Wallet, X } from 'lucide-react-native'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
// Gesture-handler's ScrollView cooperates with the sheet's pan gesture; RN's horizontal rows never scrolled.
import { ScrollView } from 'react-native-gesture-handler'
import { Button } from '@/components/button'
import { Press } from '@/components/press'
import { Chip } from '@/components/chip'
import { IconTile } from '@/components/icon-tile'
import { Keypad } from '@/components/keypad'
import { KeypadAmount } from '@/components/keypad-amount'
import { Segmented } from '@/components/segmented'
import { txTitle } from '@/components/transaction-row'
import { useProfile, useToday } from '@/lib/profile'
import { duration, easing, haptic, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'
import { formReducer, initialForm, toDraft, type QuickLogType } from '@hisab/db'
import type { OpenOptions } from './provider'
import { checkBudgetAlerts } from '@/features/notify/budget-alerts'

type Panel = 'none' | 'categories' | 'account' | 'toAccount' | 'day' | 'note' | 'party' | 'fx'
type AccountOption = { id: string; name: string; type: string }

/** Chip rows run edge to edge and scroll under the sheet's side padding instead of being cut at it. */
const BLEED = { marginHorizontal: -16 } as const
const ROW = { gap: 8, paddingHorizontal: 16, paddingVertical: 2 } as const

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
  // Save has gone through: the button shows ✓ for a beat, then the sheet closes.
  const [done, setDone] = useState(false)
  const { reduced } = useMotion()
  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))
  /** Blocked save: warning haptic and a short head-shake on the button (no movement with reduced motion). */
  const refuse = (kind: 'warning' | 'error') => {
    haptic[kind]()
    if (reduced) return
    const t = (x: number) => withTiming(x, { duration: 45, easing: easing.inOut })
    shakeX.value = withSequence(t(-9), t(8), t(-6), t(4), t(-2), t(0))
  }
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

  /**
   * Save: validate, morph Save into ✓ (success haptic), close the sheet, then write. The write comes last on
   * purpose — every live query re-runs when it lands, and on a busy JS thread that would hold the ✓ (and the
   * close) on screen for a second or more. Validation runs first, so the write itself can only fail on a
   * storage error, which is reported with a toast.
   */
  const commit = (draft: TransactionDraft, label: string) => {
    if (busy.current) return
    const checked = transactionInput.safeParse(draft)
    if (!checked.success) {
      refuse('error')
      setHint(checked.error.issues[0]?.message ?? 'Check the details')
      return
    }
    busy.current = true
    setDone(true)
    haptic.success()
    setTimeout(() => {
      onDone()
      void write(draft, label).catch((e: unknown) =>
        toast({ message: e instanceof ValidationError ? (e.issues[0]?.message ?? 'Check the details') : 'Couldn’t save. Please try again.', kind: 'error' }),
      )
    }, reduced ? duration.fast : 360)
  }

  const write = async (draft: TransactionDraft, label: string) => {
    if (editing && options.edit) {
      const before = options.edit
      const updated = updateTransaction(db, form.editingId!, draft)
      toast({
        haptic: false,
        message: `Updated · ${label}`,
        onUndo: async () => {
          await updated
          await updateTransaction(db, before.id, {
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
          })
        },
      })
      await updated
      return
    }
    // Toast first (the sheet is closing now); Undo waits for the insert to land.
    const created = createTransaction(db, profile.userId, draft)
    toast({ message: `Saved · ${label}`, onUndo: async () => softDeleteTransaction(db, await created), haptic: false })
    await created
    if (draft.type === 'expense' && draft.category_id) {
      void checkBudgetAlerts(db, { category_id: draft.category_id, amount_minor: draft.amount_minor, occurred_on: draft.occurred_on }, profile.currency, profile.grouping, profile.hideAmounts).catch(() => {})
    }
  }

  // Toast text follows "Hide amounts"; what you type on the keypad is always shown.
  const moneyText = (minor: number) => (profile.hideAmounts ? `${profile.currency} ••••` : formatMoney(minor, profile.currency, { grouping: profile.grouping }).text)

  const save = () => {
    const r = toDraft(form, new Date(), profile.timeZone)
    if (!r.ok) {
      refuse('warning')
      setHint(MISSING_HINT[r.missing])
      if (r.missing === 'category') setPanel('categories')
      if (r.missing === 'toAccount') setPanel('toAccount')
      if (r.missing === 'rate') setPanel('fx')
      return
    }
    const name = form.type === 'transfer' ? 'Transfer' : (byId.get(form.categoryId!)?.name ?? '')
    void commit(r.draft, `${name} ${moneyText(r.draft.amount_minor)}`)
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
      commit(draft, `${s.note || cat?.name || ''} ${moneyText(s.amount_minor)}`)
    })()
  }

  const remove = async () => {
    if (!form.editingId) return
    const id = form.editingId
    const txLabel = options.edit ? txTitle(options.edit) : ''
    // Close first: the delete re-runs every live query, which would otherwise hold the sheet open.
    onDone()
    const deleted = softDeleteTransaction(db, id)
    toast({ message: `Deleted · ${txLabel}`, onUndo: async () => (await deleted, restoreTransaction(db, id)) })
    try {
      await deleted
    } catch {
      toast({ message: 'Couldn’t delete it. Please try again.', kind: 'error' })
    }
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
          <Text style={{ color: colors.textFaint, fontSize: 12, fontWeight: '500', marginBottom: 8 }}>Suggested now · tap to log</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
            {suggestions.map((s) => {
              const c = byId.get(s.category_id)
              return (
                <Chip
                  key={`${s.category_id}-${s.amount_minor}-${s.note}`}
                  size="sm"
                  icon={<Text style={{ fontSize: 13 }}>{c?.icon ?? '•'}</Text>}
                  label={`${s.note || c?.name || ''} · ${profile.hideAmounts ? '••••' : formatMoney(s.amount_minor, profile.currency, { grouping: profile.grouping }).number}`}
                  onPress={() => logSuggestion(s)}
                />
              )
            })}
          </ScrollView>
        </View>
      )}

      {/* Amount */}
      <View style={{ alignItems: 'center', paddingVertical: 10, minHeight: 72, justifyContent: 'center' }}>
        <KeypadAmount keypad={form.keypad} currency={form.fx ? form.fx.currency : profile.currency} grouping={profile.grouping} color={colors.text} faint={colors.textFaint} />
        {form.fx && (
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
            {fxAmount !== null ? `= ${formatMoney(fxAmount, profile.currency, { grouping: profile.grouping }).text}` : 'Enter the rate you got'}
          </Text>
        )}
      </View>

      {/* What: categories, or from → to for transfers */}
      {form.type === 'transfer' ? (
        <View className="flex-row items-center gap-2">
          <Chip label={account?.name ?? 'From'} icon={(c) => <Wallet size={14} color={c} />} selected={panel === 'account'} onPress={() => togglePanel('account')} />
          <ChevronRight size={16} color={colors.textFaint} />
          <Chip
            label={toAccount?.name ?? 'To account'}
            icon={(c) => <Wallet size={14} color={c} />}
            selected={panel === 'toAccount'}
            onPress={() => togglePanel('toAccount')}
          />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, borderRadius: 16, backgroundColor: colors.surfaceMuted, paddingVertical: 8, paddingHorizontal: 4 }}>
          {categories.map((c) => (
            <Press
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              accessibilityState={{ selected: form.categoryId === c.id }}
              haptic="selection"
              feedback="scale"
              onPress={() => void selectCategory(c.id)}
              style={{ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 8 }}
            >
              <View style={{ borderRadius: 15, borderWidth: 2, borderColor: form.categoryId === c.id ? colors.text : 'transparent', padding: 1 }}>
                <IconTile icon={c.icon} tint={c.color} size={40} />
              </View>
              <Text numberOfLines={1} style={{ fontSize: 11.5, maxWidth: '92%', color: form.categoryId === c.id ? colors.text : colors.textMuted, fontWeight: form.categoryId === c.id ? '700' : '500' }}>
                {c.name}
              </Text>
            </Press>
          ))}
        </View>
      )}
      {(panel === 'account' || panel === 'toAccount') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={BLEED} contentContainerStyle={ROW}>
        {form.type !== 'transfer' && (
          <Chip size="sm" tone="muted" icon={(c) => <Wallet size={14} color={c} />} label={account?.name ?? 'Account'} selected={panel === 'account'} onPress={() => togglePanel('account')} />
        )}
        <Chip size="sm" tone="muted" icon={(c) => <Calendar size={14} color={c} />} label={dayLabel(form.day, today)} selected={panel === 'day'} onPress={() => togglePanel('day')} />
        <Chip
          size="sm"
          tone="muted"
          icon={(c) => <StickyNote size={14} color={c} />}
          label={form.note.trim() ? truncate(form.note.trim(), 18) : 'Note'}
          selected={panel === 'note'}
          onPress={() => togglePanel('note')}
        />
        {form.type === 'income' && (
          <>
            <Chip size="sm" tone="muted" icon={(c) => <User size={14} color={c} />} label={party?.name ?? 'From'} selected={panel === 'party'} onPress={() => togglePanel('party')} />
            <Chip
              size="sm"
              tone="muted"
              icon={(c) => <Globe size={14} color={c} />}
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

      {panel !== 'note' && panel !== 'party' && panel !== 'fx' && panel !== 'categories' && <Keypad onKey={(key) => (dispatch({ type: 'key', key }), setHint(null))} />}

      <View style={{ minHeight: 16 }}>
        {hint ? (
          <Animated.Text key={hint} entering={FadeIn.duration(duration.fast)} accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12.5, textAlign: 'center' }}>
            {hint}
          </Animated.Text>
        ) : null}
      </View>

      <View className="flex-row gap-2">
        {editing && (
          <Press
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
            haptic="selection"
            feedback="scale"
            onPress={() => void remove()}
            style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Trash2 size={20} color={colors.danger} />
          </Press>
        )}
        <Animated.View style={[{ flex: 1 }, shakeStyle]}>
          <Button onPress={save} done={done}>
            {editing ? 'Save changes' : 'Save'}
          </Button>
        </Animated.View>
      </View>
    </View>
  )
}

function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      haptic="selection"
      feedback="scale"
      onPress={onPress}
      style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </Press>
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
