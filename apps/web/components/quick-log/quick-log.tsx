'use client'

import { addDays, convertFx, dayLabel, formatMoney, keypadToMinor, type KeypadKey } from '@hisab/core'
import {
  createParty,
  createTransaction,
  formReducer,
  initialForm,
  Q,
  restoreTransaction,
  softDeleteTransaction,
  toDraft,
  updateTransaction,
  ValidationError,
  type CategoryOption,
  type QuickLogType,
  type TransactionDraft,
  type TransactionView,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { CalendarDays, Check, Search, Trash2 } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { toast } from '@/components/ui/toaster'
import { Button, Kbd } from '@/components/ui/button'
import { Chip, Select } from '@/components/ui/chip'
import { Dialog, DialogContent, Field } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { haptic } from '@/lib/haptics'
import { DUR, reducedMotion, shake } from '@/lib/motion'
import { MASK, usePrivacy } from '@/lib/privacy'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

interface OpenOptions {
  edit?: TransactionView
  type?: QuickLogType
}
const QuickLogContext = createContext<{ open: (o?: OpenOptions) => void }>({ open: () => {} })
/** Opens the quick-log dialog (new entry or edit). */
export const useQuickLog = () => use(QuickLogContext)

interface Lists {
  accounts: { id: string; name: string }[]
  expenseCategories: CategoryOption[]
  incomeCategories: CategoryOption[]
  parties: { id: string; name: string }[]
  /** False until the first local query results arrive (≈1s after a cold page load). */
  ready: boolean
}

export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; key: number; opts: OpenOptions }>({ open: false, key: 0, opts: {} })
  // Loaded once and kept warm, so the dialog is usable the instant it opens (fast keyboard flow).
  const { data: accounts, isLoading: l1 } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: expenseCategories, isLoading: l2 } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: incomeCategories } = useQuery<CategoryOption>(Q.categories, ['income'])
  const { data: parties } = useQuery<{ id: string; name: string }>(Q.parties)
  const lists: Lists = { accounts, expenseCategories, incomeCategories, parties, ready: !l1 && !l2 }
  const open = useCallback((opts: OpenOptions = {}) => setState((s) => ({ open: true, key: s.key + 1, opts })), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <QuickLogContext value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        {/* Always rendered: Radix mounts it while open and keeps it for the exit animation. */}
        <DialogContent title={state.opts.edit ? 'Edit transaction' : 'Log money'}>
          <QuickLogForm key={state.key} options={state.opts} lists={lists} onDone={() => setState((s) => ({ ...s, open: false }))} />
        </DialogContent>
      </Dialog>
    </QuickLogContext>
  )
}

const TYPES: { value: QuickLogType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]
const MISSING = {
  amount: 'Enter an amount',
  category: 'Pick a category',
  account: 'Add an account first (Settings)',
  toAccount: 'Pick the account to move money to',
  rate: 'Enter the exchange rate you got',
} as const

function QuickLogForm({ options, lists, onDone }: { options: OpenOptions; lists: Lists; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const { hidden } = usePrivacy()
  const today = useToday(timeZone)
  const { accounts, parties } = lists
  const [form, dispatch] = useReducer(formReducer, undefined, () => initialForm({ today, accountId: options.edit ? null : (lists.accounts[0]?.id ?? null) }))
  const categories = form.type === 'income' ? lists.incomeCategories : lists.expenseCategories
  const [amountText, setAmountText] = useState('')
  const [catQuery, setCatQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingParty, setAddingParty] = useState(false)
  const [partyName, setPartyName] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  const amountBox = useRef<HTMLDivElement>(null)
  const categoryBox = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const editing = Boolean(options.edit)

  useEffect(() => {
    if (options.edit) {
      dispatch({ type: 'load', tx: options.edit })
      const t = options.edit
      const shown = t.original_amount_minor && t.fx_rate ? t.original_amount_minor : t.amount_minor
      setAmountText(String(shown / 100))
    } else if (options.type) dispatch({ type: 'setType', value: options.type })
    amountRef.current?.focus()
  }, [options])

  useEffect(() => {
    if (!options.edit && !form.accountId && accounts[0]) dispatch({ type: 'setAccount', id: accounts[0].id })
  }, [accounts, form.accountId, options.edit])

  // Mirror the free-typed amount into the shared calculator state.
  useEffect(() => {
    dispatch({ type: 'key', key: 'clear' })
    for (const ch of amountText.replace(/,/g, '')) if (/[\d.]/.test(ch)) dispatch({ type: 'key', key: ch as KeypadKey })
  }, [amountText])

  const selectedCategory = categories.find((c) => c.id === form.categoryId)
  const filtered = categories.filter((c) => c.name.toLowerCase().includes(catQuery.trim().toLowerCase()))
  const typed = keypadToMinor(form.keypad)
  const fxPreview = form.fx && typed !== null && /^\d{1,12}(\.\d{1,8})?$/.test(form.fx.rate) ? safeFx(typed, form.fx.rate) : null

  /** Blocked: say why, and shake the part that needs attention. */
  const block = (message: string, where: 'amount' | 'category' | 'save' = 'save') => {
    setHint(message)
    shake(where === 'amount' ? amountBox.current : where === 'category' ? categoryBox.current : saveRef.current)
  }

  const save = async () => {
    if (busy || !lists.ready) return
    if (amountText.trim() && !/^\d{1,10}(\.\d{1,2})?$/.test(amountText.replace(/,/g, '').trim())) return block('Enter an amount like 1450 or 1,450.50', 'amount')
    const r = toDraft(form.accountId || form.type === 'transfer' ? form : { ...form, accountId: accounts[0]?.id ?? null }, new Date(), timeZone)
    if (!r.ok) return block(MISSING[r.missing], r.missing === 'amount' || r.missing === 'rate' ? 'amount' : r.missing === 'category' ? 'category' : 'save')
    setBusy(true)
    try {
      const amount = hidden ? `${currency} ${MASK}` : formatMoney(r.draft.amount_minor, currency, { grouping }).text
      const label = `${form.type === 'transfer' ? 'Transfer' : (categories.find((c) => c.id === form.categoryId)?.name ?? '')} ${amount}`
      let announce: () => void
      if (editing && options.edit) {
        const before = options.edit
        await updateTransaction(db, before.id, r.draft)
        announce = () => toast(`Updated · ${label}`, { action: { label: 'Undo', onClick: () => void updateTransaction(db, before.id, snapshot(before)) } })
      } else {
        const id = await createTransaction(db, userId, r.draft)
        announce = () => toast(`Saved · ${label}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, id) } })
      }
      // Save morphs into a check for a beat, then the dialog closes and the toast drops in.
      haptic('success')
      setSaved(true)
      setTimeout(
        () => {
          onDone()
          announce()
        },
        reducedMotion() ? 0 : DUR.slow + 170,
      )
    } catch (e) {
      haptic('warning')
      shake(saveRef.current)
      setHint(e instanceof ValidationError ? (e.issues[0]?.message ?? 'Check the details') : 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!options.edit) return
    const id = options.edit.id
    await softDeleteTransaction(db, id)
    toast('Deleted', { action: { label: 'Undo', onClick: () => void restoreTransaction(db, id) } })
    onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        // Enter in the category filter picks the first match instead of submitting.
        if (e.key === 'Enter' && (e.target as HTMLElement).dataset.role === 'category-filter') {
          e.preventDefault()
          if (!lists.ready) return
          // Empty filter: Enter means "save", never "pick the first category".
          if (!catQuery.trim()) return void save()
          if (!filtered[0]) return block('No category matches', 'category')
          dispatch({ type: 'setCategory', id: filtered[0].id })
          setCatQuery('')
          setHint(null)
          amountRef.current?.focus()
        }
      }}
      className="flex flex-col gap-4"
    >
      <div role="tablist" aria-label="Type" className="flex rounded-[12px] bg-surface-muted p-[3px] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={form.type === t.value}
            onClick={() => {
              dispatch({ type: 'setType', value: t.value, otherAccountId: accounts.find((a) => a.id !== form.accountId)?.id ?? null })
              setHint(null)
            }}
            className={cn(
              'h-8 flex-1 rounded-[9px] text-[13px] transition-[background-color,color,box-shadow] duration-150',
              form.type === t.value ? 'bg-surface font-semibold text-text shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)] dark:bg-[#26272a]' : 'text-text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount: the hero of the dialog. */}
      <div
        ref={amountBox}
        onClick={() => amountRef.current?.focus()}
        className="flex cursor-text items-baseline gap-2 rounded-[16px] border border-border bg-surface-muted/40 px-4 pt-3 pb-2.5 transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-text-faint focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/[0.06]"
      >
        <span className="num text-[15px] font-medium text-text-faint">{form.fx?.currency ?? currency}</span>
        <AmountInput
          ref={amountRef}
          value={amountText}
          income={form.type === 'income'}
          onChange={(v) => {
            setAmountText(v)
            setHint(null)
          }}
        />
      </div>
      {form.fx && <p className="-mt-2 px-1 text-[12.5px] text-text-muted">{fxPreview !== null ? `= ${formatMoney(fxPreview, currency, { grouping }).text}` : 'Enter the rate you got'}</p>}

      {form.type === 'transfer' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Select wrapperClassName="w-full" value={form.accountId ?? ''} onChange={(e) => dispatch({ type: 'setAccount', id: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select wrapperClassName="w-full" value={form.toAccountId ?? ''} onChange={(e) => dispatch({ type: 'setToAccount', id: e.target.value })}>
              <option value="" disabled>
                Choose…
              </option>
              {accounts
                .filter((a) => a.id !== form.accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      ) : (
        <div ref={categoryBox} className="flex flex-col gap-2">
          <label className="flex h-10 items-center gap-2 rounded-[12px] border border-border bg-surface px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-text-faint focus-within:ring-4 focus-within:ring-brand/[0.06]">
            <Search className="size-4 shrink-0 text-text-faint" aria-hidden />
            <input
              data-role="category-filter"
              aria-label="Find category"
              placeholder="Category — type to filter, Enter to pick"
              value={catQuery}
              onChange={(e) => setCatQuery(e.target.value)}
              className="w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-text-faint"
            />
            {selectedCategory && !catQuery && (
              <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-text-muted">
                <span aria-hidden>{selectedCategory.icon}</span>
                <span className="max-w-28 truncate">{selectedCategory.name}</span>
              </span>
            )}
          </label>
          <div className={cn('no-scrollbar overflow-y-auto', filtered.length > 18 && 'fade-y max-h-[176px] pb-3')}>
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((c, i) => {
                const on = form.categoryId === c.id
                return (
                  <Chip
                    key={c.id}
                    size="sm"
                    selected={on}
                    icon={<span aria-hidden>{c.icon}</span>}
                    onClick={() => (dispatch({ type: 'setCategory', id: c.id }), setHint(null))}
                    className={cn(!on && catQuery.trim() && i === 0 && 'border-text-faint/70 bg-surface-muted')}
                  >
                    {c.name}
                  </Chip>
                )
              })}
              {!lists.ready && categories.length === 0
                ? [64, 92, 84, 108, 60, 76, 96].map((w, i) => <span key={i} aria-hidden className="skeleton h-8 rounded-full" style={{ width: w }} />)
                : filtered.length === 0 && (
                    <p className="w-full py-3 text-center text-[13px] text-text-muted">{catQuery.trim() ? `No category matches “${catQuery.trim()}”.` : 'No categories yet.'}</p>
                  )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[14px] border border-border-subtle bg-surface-muted/40 px-3 py-3">
        {form.type !== 'transfer' && accounts.length > 0 && (
          <OptionRow label="Account">
            {accounts.map((a) => (
              <Chip key={a.id} size="sm" selected={(form.accountId ?? accounts[0]?.id) === a.id} onClick={() => dispatch({ type: 'setAccount', id: a.id })}>
                {a.name}
              </Chip>
            ))}
          </OptionRow>
        )}
        <OptionRow label="Date">
          <Chip size="sm" selected={form.day === today} onClick={() => dispatch({ type: 'setDay', day: today })}>
            Today
          </Chip>
          <Chip size="sm" selected={form.day === addDays(today, -1)} onClick={() => dispatch({ type: 'setDay', day: addDays(today, -1) })}>
            Yesterday
          </Chip>
          <span className="relative inline-flex">
            <Chip
              size="sm"
              selected={form.day < addDays(today, -1)}
              icon={<CalendarDays className="size-3.5" />}
              onClick={() => {
                const el = dateRef.current
                if (!el) return
                try {
                  el.showPicker()
                } catch {
                  el.focus()
                }
              }}
            >
              {form.day < addDays(today, -1) ? dayLabel(form.day, today) : 'Pick a day'}
            </Chip>
            <input
              ref={dateRef}
              type="date"
              aria-label="Date"
              tabIndex={-1}
              max={today}
              min={addDays(today, -3650)}
              value={form.day}
              onChange={(e) => e.target.value && dispatch({ type: 'setDay', day: e.target.value })}
              className="pointer-events-none absolute inset-0 opacity-0"
            />
          </span>
        </OptionRow>
      </div>

      {form.type === 'income' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From (optional)">
            <Select
              wrapperClassName="w-full"
              value={form.partyId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new__') return setAddingParty(true)
                dispatch({ type: 'setParty', id: e.target.value || null })
              }}
            >
              <option value="">—</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__new__">+ New…</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Currency" className="flex-1">
              <Select
                wrapperClassName="w-full"
                value={form.fx?.currency ?? ''}
                onChange={(e) => {
                  if (!e.target.value) return form.fx && dispatch({ type: 'toggleFx' })
                  if (!form.fx) dispatch({ type: 'toggleFx' })
                  dispatch({ type: 'setFxCurrency', value: e.target.value })
                }}
              >
                <option value="">{currency}</option>
                {['USD', 'EUR', 'GBP', 'AED', 'SAR', 'MYR', 'SGD', 'CAD', 'AUD', 'INR'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            {form.fx && <Input aria-label="Exchange rate" inputMode="decimal" placeholder="Rate" value={form.fx.rate} onChange={(e) => dispatch({ type: 'setFxRate', value: e.target.value })} className="num w-24" />}
          </div>
        </div>
      )}

      {addingParty && (
        <div className="-mt-1 flex gap-2">
          <Input
            aria-label="New company or client"
            autoFocus
            placeholder="Company or client name"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              e.stopPropagation()
              if (!partyName.trim()) return
              dispatch({ type: 'setParty', id: await createParty(db, userId, { name: partyName.trim(), kind: 'company' }) })
              setPartyName('')
              setAddingParty(false)
            }}
          />
          <Button
            variant="secondary"
            className="h-11"
            onClick={async () => {
              if (!partyName.trim()) return
              dispatch({ type: 'setParty', id: await createParty(db, userId, { name: partyName.trim(), kind: 'company' }) })
              setPartyName('')
              setAddingParty(false)
            }}
          >
            Add
          </Button>
        </div>
      )}

      <Input aria-label="Note" placeholder="Note (optional)" value={form.note} maxLength={500} onChange={(e) => dispatch({ type: 'setNote', value: e.target.value })} />

      <p role="alert" className={cn('-my-1.5 min-h-5 text-[13px] text-danger', !hint && 'invisible')}>
        {hint ?? ' '}
      </p>
      <div className="sheet-footer sticky -bottom-5 z-10 -mx-5 -mb-5 flex gap-2 border-t border-transparent bg-surface px-5 pt-1 pb-5 md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
        {editing && (
          <Button variant="danger" size="lg" className="w-12 px-0" aria-label="Delete" title="Delete" onClick={() => void remove()}>
            <Trash2 />
          </Button>
        )}
        <Button ref={saveRef} type="submit" size="lg" className={cn('flex-1', saved && 'disabled:opacity-100')} disabled={busy || !lists.ready}>
          {saved ? (
            <span key="saved" className="check-in flex items-center gap-1.5">
              <Check className="size-[18px]!" strokeWidth={3} /> Saved
            </span>
          ) : (
            <>
              {editing ? 'Save changes' : 'Save'}
              <Kbd inverted className="ml-1 max-md:hidden">
                ↵
              </Kbd>
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

/**
 * The amount field. The input keeps the caret, selection and IME; its text is transparent and a mirror
 * underneath draws the same characters, so each newly typed digit can rise in. Long amounts step the size
 * down rather than scroll (the mirror must never drift from the input).
 */
function AmountInput({ ref, value, income, onChange }: { ref: React.Ref<HTMLInputElement>; value: string; income: boolean; onChange: (v: string) => void }) {
  const size = value.length > 11 ? 'text-[26px]' : value.length > 8 ? 'text-[32px]' : 'text-[40px]'
  const shared = cn('num leading-none font-semibold tracking-[-0.03em]', size)
  return (
    <span className="relative flex h-12 min-w-0 flex-1 items-center">
      <span aria-hidden className={cn(shared, 'pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-pre', income && 'text-positive')}>
        {[...value].map((ch, i) => (
          <span key={`${i}:${ch}`} className="digit-in">
            {ch}
          </span>
        ))}
      </span>
      <input
        ref={ref}
        aria-label="Amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(shared, 'relative h-12 w-full min-w-0 bg-transparent text-transparent caret-text outline-none placeholder:text-text-faint/60 selection:bg-brand/15')}
      />
    </span>
  )
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-start gap-3">
      <span className="w-[60px] shrink-0 pt-[7px] text-[12.5px] font-medium text-text-faint">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function snapshot(t: TransactionView): TransactionDraft {
  return {
    type: t.type,
    amount_minor: t.amount_minor,
    account_id: t.account_id,
    to_account_id: t.to_account_id,
    category_id: t.category_id,
    party_id: t.party_id,
    occurred_on: t.occurred_on,
    occurred_at: t.occurred_at,
    note: t.note,
    original_amount_minor: t.original_amount_minor,
    original_currency: t.original_currency,
    fx_rate: t.fx_rate,
  }
}

function safeFx(minor: number, rate: string) {
  try {
    return convertFx(minor, rate)
  } catch {
    return null
  }
}
