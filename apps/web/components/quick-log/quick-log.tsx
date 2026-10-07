'use client'

import { addDays, convertFx, formatMoney, keypadToMinor, type KeypadKey } from '@hisab/core'
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
import { Trash2 } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip, Select } from '@/components/ui/chip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
        {state.open && (
          <DialogContent title={state.opts.edit ? 'Edit transaction' : 'Log money'} description="Type the amount, pick a category, press Enter.">
            <QuickLogForm key={state.key} options={state.opts} lists={lists} onDone={() => setState((s) => ({ ...s, open: false }))} />
          </DialogContent>
        )}
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
  const [addingParty, setAddingParty] = useState(false)
  const [partyName, setPartyName] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
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

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(catQuery.trim().toLowerCase()))
  const typed = keypadToMinor(form.keypad)
  const fxPreview = form.fx && typed !== null && /^\d{1,12}(\.\d{1,8})?$/.test(form.fx.rate) ? safeFx(typed, form.fx.rate) : null

  const save = async () => {
    if (busy || !lists.ready) return
    if (amountText.trim() && !/^\d{1,10}(\.\d{1,2})?$/.test(amountText.replace(/,/g, '').trim())) return setHint('Enter an amount like 1450 or 1,450.50')
    const r = toDraft(form.accountId || form.type === 'transfer' ? form : { ...form, accountId: accounts[0]?.id ?? null }, new Date(), timeZone)
    if (!r.ok) return setHint(MISSING[r.missing])
    setBusy(true)
    try {
      const amount = hidden ? `${currency} ${MASK}` : formatMoney(r.draft.amount_minor, currency, { grouping }).text
      const label = `${form.type === 'transfer' ? 'Transfer' : (categories.find((c) => c.id === form.categoryId)?.name ?? '')} ${amount}`
      if (editing && options.edit) {
        const before = options.edit
        await updateTransaction(db, before.id, r.draft)
        toast(`Updated · ${label}`, { action: { label: 'Undo', onClick: () => void updateTransaction(db, before.id, snapshot(before)) } })
      } else {
        const id = await createTransaction(db, userId, r.draft)
        toast(`Saved · ${label}`, { action: { label: 'Undo', onClick: () => void softDeleteTransaction(db, id) } })
      }
      onDone()
    } catch (e) {
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
          if (!filtered[0]) return setHint('No category matches')
          dispatch({ type: 'setCategory', id: filtered[0].id })
          setCatQuery('')
          setHint(null)
          amountRef.current?.focus()
        }
      }}
      className="flex flex-col gap-4"
    >
      <div role="tablist" className="flex rounded-[12px] bg-surface-muted p-[3px]">
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
            className={cn('h-8 flex-1 rounded-[10px] text-[13px]', form.type === t.value ? 'bg-surface font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-text-muted')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-[16px] border border-border px-4 py-2 focus-within:border-text-faint">
        <span className="currency-code text-[15px]">{form.fx?.currency ?? currency}</span>
        <input
          ref={amountRef}
          aria-label="Amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value)
            setHint(null)
          }}
          className="num h-12 w-full bg-transparent text-[30px] font-bold outline-none placeholder:text-text-faint"
        />
      </div>
      {form.fx && <p className="-mt-2 text-[12.5px] text-text-muted">{fxPreview !== null ? `= ${formatMoney(fxPreview, currency, { grouping }).text}` : 'Enter the rate you got'}</p>}

      {form.type === 'transfer' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] text-text-muted">
            From
            <Select className="mt-1 w-full" value={form.accountId ?? ''} onChange={(e) => dispatch({ type: 'setAccount', id: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[12px] text-text-muted">
            To
            <Select className="mt-1 w-full" value={form.toAccountId ?? ''} onChange={(e) => dispatch({ type: 'setToAccount', id: e.target.value })}>
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
          </label>
        </div>
      ) : (
        <div>
          <Input data-role="category-filter" aria-label="Find category" placeholder="Category — type to filter, Enter to pick" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} className="h-10 text-[14px]" />
          <div className="mt-2 flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
            {filtered.map((c) => (
              <Chip key={c.id} selected={form.categoryId === c.id} icon={<span>{c.icon}</span>} onClick={() => (dispatch({ type: 'setCategory', id: c.id }), setHint(null))}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {form.type !== 'transfer' && (
          <label className="text-[12px] text-text-muted">
            Account
            <Select className="mt-1 w-full" value={form.accountId ?? ''} onChange={(e) => dispatch({ type: 'setAccount', id: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="text-[12px] text-text-muted">
          Date
          <input
            type="date"
            aria-label="Date"
            max={today}
            min={addDays(today, -3650)}
            value={form.day}
            onChange={(e) => e.target.value && dispatch({ type: 'setDay', day: e.target.value })}
            className="mt-1 h-10 w-full rounded-[12px] border border-border bg-surface px-3 text-[14px] text-text"
          />
        </label>
        {form.type === 'income' && (
          <label className="text-[12px] text-text-muted">
            From (optional)
            <Select
              className="mt-1 w-full"
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
          </label>
        )}
        {form.type === 'income' && (
          <label className="flex items-end gap-2 text-[12px] text-text-muted">
            <span className="flex-1">
              Currency
              <Select
                className="mt-1 w-full"
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
            </span>
            {form.fx && (
              <Input aria-label="Exchange rate" inputMode="decimal" placeholder="Rate" value={form.fx.rate} onChange={(e) => dispatch({ type: 'setFxRate', value: e.target.value })} className="h-10 w-24 text-[14px]" />
            )}
          </label>
        )}
      </div>

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
            className="h-10 text-[14px]"
          />
          <Button
            variant="secondary"
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

      <Input aria-label="Note" placeholder="Note (optional)" value={form.note} maxLength={500} onChange={(e) => dispatch({ type: 'setNote', value: e.target.value })} className="h-10 text-[14px]" />

      <p role="alert" className={cn('-my-1 min-h-5 text-[13px] text-danger', !hint && 'invisible')}>
        {hint ?? ' '}
      </p>
      <div className="flex gap-2">
        {editing && (
          <Button variant="outline" size="icon" className="size-11" aria-label="Delete" onClick={() => void remove()}>
            <Trash2 className="text-danger" />
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={busy || !lists.ready}>
          {editing ? 'Save changes' : 'Save'} <kbd className="ml-1 rounded bg-white/15 px-1.5 text-[11px] font-medium">↵</kbd>
        </Button>
      </div>
    </form>
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
