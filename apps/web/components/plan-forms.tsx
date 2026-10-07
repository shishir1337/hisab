'use client'

import { addDays, formatMoney, loanProgress, occurrences, parseAmount } from '@hisab/core'
import {
  closeLoan,
  createLoan,
  createParty,
  createRecurringRule,
  deleteRecurringRule,
  pauseRecurringRule,
  Q,
  updateLoan,
  updateRecurringRule,
  ValidationError,
  type CategoryOption,
  type LoanWithPayments,
  type RecurringRuleView,
} from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Minus, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/money'
import { Button, Kbd } from '@/components/ui/button'
import { Chip, Select } from '@/components/ui/chip'
import { Field } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { MASK, usePrivacy } from '@/lib/privacy'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "10 Oct" (this year) or "10 Oct 2027". */
const shortDay = (d: string, today: string) =>
  `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}${d.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`}`
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

type Errors = Partial<Record<string, string>>
const issuesOf = (e: unknown): Errors => {
  if (!(e instanceof ValidationError)) return { form: 'Couldn’t save. Try again.' }
  const out: Errors = {}
  for (const i of e.issues) {
    const k = String(i.path[0] ?? 'form')
    out[k] ??= i.message
  }
  return out
}

// ---------------------------------------------------------------- shared bits

/** The amount is the hero of a money form: big tabular digits behind the ISO code (never a symbol). */
function AmountInput({
  value,
  onChange,
  currency,
  label,
  tone,
  invalid,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  currency: string
  label: string
  tone?: 'positive'
  invalid?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      onClick={() => ref.current?.focus()}
      className={cn(
        'flex cursor-text items-baseline gap-2 rounded-[16px] border bg-surface-muted/40 px-4 pt-3 pb-2.5 transition-[border-color,box-shadow,background-color] duration-150 focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/[0.06]',
        invalid ? 'border-danger' : 'border-border focus-within:border-text-faint',
      )}
    >
      <span className="num text-[15px] font-medium text-text-faint">{currency}</span>
      <input
        ref={ref}
        aria-label={label}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'num h-11 w-full min-w-0 bg-transparent text-[36px] leading-none font-semibold tracking-[-0.03em] outline-none placeholder:text-text-faint/60',
          tone === 'positive' && value && 'text-positive',
        )}
      />
    </div>
  )
}

/** − [n] + : arrow keys and typing both work. */
function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  className,
}: {
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  label: string
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const btn =
    'grid h-full w-9 shrink-0 place-items-center text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5'
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex h-11 items-stretch overflow-hidden rounded-[12px] border border-border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-text-faint focus-within:ring-4 focus-within:ring-brand/[0.06]',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={btn}
      >
        <Minus />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={text ?? String(value)}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 3)
          setText(t)
          if (t) onChange(clamp(Number(t)))
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setText(null)
            onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1)))
          }
        }}
        className="num w-12 min-w-0 flex-1 bg-transparent text-center text-[15px] font-semibold outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={btn}
      >
        <Plus />
      </button>
    </div>
  )
}

/** Field for compound controls (steppers): a <label> would forward clicks to the first button inside. */
function GroupField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-text-faint">{hint}</span>}
    </div>
  )
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return (
    <p id={id} className="-mt-2 px-0.5 text-[12.5px] text-danger">
      {message}
    </p>
  )
}

/** A labelled group of chips (labels a group, not a single input, so it isn't a <label>). */
function ChipGroup({
  label,
  hint,
  children,
  error,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  error?: string
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3 text-[12.5px] font-medium text-text-muted">
        {label}
        {hint && <span className="truncate font-normal text-text-faint">{hint}</span>}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {error && <p className="px-0.5 text-[12.5px] text-danger">{error}</p>}
    </div>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex flex-col gap-2 bg-surface px-5 pt-1 pb-5 md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
      {children}
    </div>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="flex-1" disabled={busy}>
      {children}
      <Kbd inverted className="ml-1 max-md:hidden">
        ↵
      </Kbd>
    </Button>
  )
}

// ---------------------------------------------------------------- recurring

type RuleType = RecurringRuleView['type']
type Frequency = RecurringRuleView['frequency']
const UNIT: Record<Frequency, [string, string]> = {
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
}
/** "Every month", "Every 2 weeks"… (same wording as the phone app). */
export const cadence = (r: { frequency: Frequency; interval: number }) =>
  r.interval === 1 ? `Every ${UNIT[r.frequency][0]}` : `Every ${r.interval} ${UNIT[r.frequency][1]}`

/** Add / edit a recurring item (salary, rent, wifi bill, a monthly move to savings…). Same rules as the phone app. */
export function RecurringForm({
  rule,
  onDone,
}: {
  rule: RecurringRuleView | null
  onDone: () => void
}) {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const { hidden } = usePrivacy()
  const today = useToday(timeZone)
  const uid = useId()
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: expenseCats } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: incomeCats } = useQuery<CategoryOption>(Q.categories, ['income'])
  const { data: parties } = useQuery<{ id: string; name: string }>(Q.parties)

  const [type, setType] = useState<RuleType>(rule?.type ?? 'expense')
  const [name, setName] = useState(rule?.note ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount_minor / 100) : '')
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null)
  const [accountId, setAccountId] = useState<string | null>(rule?.account_id ?? null)
  const [toAccountId, setToAccountId] = useState<string | null>(rule?.to_account_id ?? null)
  const [partyId, setPartyId] = useState<string | null>(rule?.party_id ?? null)
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [interval, setInterval] = useState(rule?.interval ?? 1)
  const [anchor, setAnchor] = useState(rule?.anchor_date ?? today)
  const [endDate, setEndDate] = useState(rule?.end_date ?? '')
  const [auto, setAuto] = useState(rule?.mode === 'auto')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const categories = type === 'income' ? incomeCats : expenseCats
  const fromId = accountId ?? accounts[0]?.id ?? null
  const toChoices = accounts.filter((a) => a.id !== fromId)
  const clear = (...keys: string[]) =>
    setErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k) && k !== 'form')),
    )
  const upcoming = /^\d{4}-\d{2}-\d{2}$/.test(anchor)
    ? occurrences(
        { frequency, interval, anchor_date: anchor, end_date: endDate || null },
        anchor > today ? anchor : today,
        addDays(today, 3660),
      ).slice(0, 3)
    : []
  const label = (minor: number) =>
    hidden ? `${currency} ${MASK}` : formatMoney(minor, currency, { grouping }).text

  const save = async () => {
    if (busy) return
    const parsed = parseAmount(amount)
    const pre: Errors = {}
    if (!parsed.ok)
      pre.amount_minor =
        parsed.error === 'precision' ? 'Up to 2 decimals, e.g. 1,450.50' : 'Enter the amount'
    if (!fromId) pre.account_id = 'Add an account first (Settings)'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) pre.anchor_date = 'Pick a date'
    if (type !== 'transfer' && !categoryId) pre.category_id = 'Pick a category'
    if (type === 'transfer' && !toAccountId) pre.to_account_id = 'Pick the account to move money to'
    if (Object.keys(pre).length) return setErrors(pre)
    const input = {
      type,
      amount_minor: parsed.ok ? parsed.minor : 0,
      account_id: fromId!,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      party_id: type === 'income' ? partyId : null,
      note: name.trim() || null,
      frequency,
      interval,
      anchor_date: anchor,
      end_date: endDate || null,
      mode: auto ? ('auto' as const) : ('confirm' as const),
    }
    setBusy(true)
    try {
      const title =
        input.note ||
        categories.find((c) => c.id === categoryId)?.name ||
        (type === 'transfer' ? 'Transfer' : 'Recurring item')
      if (rule) {
        const before = rule
        await updateRecurringRule(db, rule.id, input, today)
        toast(`${title} updated · ${label(input.amount_minor)} ${cadence(input).toLowerCase()}`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void updateRecurringRule(
                db,
                before.id,
                {
                  type: before.type,
                  amount_minor: before.amount_minor,
                  account_id: before.account_id,
                  to_account_id: before.to_account_id,
                  category_id: before.category_id,
                  party_id: before.party_id,
                  note: before.note,
                  frequency: before.frequency,
                  interval: before.interval,
                  anchor_date: before.anchor_date,
                  end_date: before.end_date,
                  mode: before.mode,
                },
                today,
              ),
          },
        })
      } else {
        const id = await createRecurringRule(db, userId, { ...input, created_on: today })
        const next = upcoming[0]
        const when = next
          ? auto
            ? `records itself on ${shortDay(next, today)}`
            : `shows in Due soon on ${shortDay(next, today)}`
          : 'added'
        toast(next ? `${title} added — ${when}` : `${title} added`, {
          action: { label: 'Undo', onClick: () => void deleteRecurringRule(db, id) },
        })
      }
      onDone()
    } catch (e) {
      setErrors(issuesOf(e))
      setBusy(false)
    }
  }

  const accountLabel =
    type === 'income' ? 'Received in' : type === 'transfer' ? 'From' : 'Paid from'

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Segmented<RuleType>
        label="Type"
        value={type}
        className="w-full"
        onChange={(t) => {
          setType(t)
          setCategoryId(rule && rule.type === t ? rule.category_id : null)
          if (t === 'transfer' && !toAccountId)
            setToAccountId(accounts.find((a) => a.id !== fromId)?.id ?? null)
          setErrors({})
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
        ]}
      />

      <Field label="Name">
        <Input
          autoFocus={!rule}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            type === 'income'
              ? 'Salary — Company A'
              : type === 'transfer'
                ? 'Monthly savings'
                : 'Wifi bill, house rent…'
          }
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-text-muted">
          {type === 'income' ? 'Usual amount' : 'Amount'}
        </span>
        <AmountInput
          label="Amount"
          currency={currency}
          value={amount}
          invalid={Boolean(errors.amount_minor)}
          tone={type === 'income' ? 'positive' : undefined}
          onChange={(v) => (setAmount(v), clear('amount_minor'))}
        />
      </div>
      <FieldError message={errors.amount_minor} />

      {type !== 'transfer' && (
        <ChipGroup label="Category" error={errors.category_id}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              size="sm"
              selected={categoryId === c.id}
              icon={<span aria-hidden>{c.icon}</span>}
              onClick={() => (setCategoryId(c.id), clear('category_id'))}
            >
              {c.name}
            </Chip>
          ))}
          {categories.length === 0 && (
            <p className="py-1 text-[13px] text-text-muted">No categories yet.</p>
          )}
        </ChipGroup>
      )}

      <div className="flex flex-col gap-3 rounded-[14px] border border-border-subtle bg-surface-muted/40 px-3 py-3">
        <ChipGroup label={accountLabel} error={errors.account_id}>
          {accounts.map((a) => (
            <Chip
              key={a.id}
              size="sm"
              selected={fromId === a.id}
              onClick={() => {
                setAccountId(a.id)
                if (toAccountId === a.id)
                  setToAccountId(accounts.find((x) => x.id !== a.id)?.id ?? null)
                clear('account_id', 'to_account_id')
              }}
            >
              {a.name}
            </Chip>
          ))}
        </ChipGroup>
        {type === 'transfer' && (
          <ChipGroup label="To" error={errors.to_account_id}>
            {toChoices.map((a) => (
              <Chip
                key={a.id}
                size="sm"
                selected={toAccountId === a.id}
                onClick={() => (setToAccountId(a.id), clear('to_account_id'))}
              >
                {a.name}
              </Chip>
            ))}
            {toChoices.length === 0 && (
              <p className="py-1 text-[13px] text-text-muted">
                Add a second account to move money between.
              </p>
            )}
          </ChipGroup>
        )}
      </div>

      {type === 'income' && parties.length > 0 && (
        <Field label="From (company / client) · optional">
          <Select
            wrapperClassName="w-full"
            value={partyId ?? ''}
            onChange={(e) => setPartyId(e.target.value || null)}
          >
            <option value="">—</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between text-[12.5px] font-medium text-text-muted">
          Repeats{' '}
          <span className="font-normal text-text-faint">{cadence({ frequency, interval })}</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Frequency>
            label="Repeats"
            value={frequency}
            onChange={setFrequency}
            className="h-11 min-w-[240px] flex-1 items-center [&>button]:h-[36px]"
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <Stepper
            label={`Every how many ${UNIT[frequency][1]}`}
            value={interval}
            onChange={setInterval}
            min={1}
            max={52}
            className="w-[120px] shrink-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={rule ? 'First date' : 'Next date'}>
          <Input
            type="date"
            required
            aria-invalid={Boolean(errors.anchor_date) || undefined}
            value={anchor}
            onChange={(e) => (setAnchor(e.target.value), clear('anchor_date', 'end_date'))}
            className="num text-[14px]"
          />
        </Field>
        <Field label="Ends · optional">
          <Input
            type="date"
            aria-invalid={Boolean(errors.end_date) || undefined}
            min={anchor}
            value={endDate}
            onChange={(e) => (setEndDate(e.target.value), clear('end_date'))}
            className={cn('num text-[14px]', !endDate && 'text-text-faint')}
          />
        </Field>
      </div>
      {(errors.anchor_date || errors.end_date) && (
        <FieldError message={errors.anchor_date ?? errors.end_date} />
      )}
      <p className="-mt-2 px-0.5 text-[12.5px] text-text-faint">
        {upcoming.length ? (
          <>
            Upcoming:{' '}
            <span className="text-text-muted">
              {upcoming.map((d) => shortDay(d, today)).join(', ')}
            </span>
            {endDate && upcoming.length < 3 ? ' · then it ends' : ''}
          </>
        ) : endDate ? (
          'This schedule has already ended.'
        ) : (
          ' '
        )}
      </p>

      <div className="flex items-center justify-between gap-4 rounded-[14px] border border-border bg-surface px-4 py-3">
        <label htmlFor={`${uid}-auto`} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-[14px] font-medium">Record automatically</span>
          <span
            id={`${uid}-auto-hint`}
            className="mt-0.5 block text-[12.5px] leading-[18px] text-text-faint"
          >
            {auto
              ? 'Logged on its date without asking.'
              : 'Shows in “Due soon” — confirm with one tap.'}
          </span>
        </label>
        <Switch
          id={`${uid}-auto`}
          checked={auto}
          onCheckedChange={setAuto}
          describedBy={`${uid}-auto-hint`}
        />
      </div>

      <p
        role="alert"
        className={cn('-my-1.5 min-h-5 text-[13px] text-danger', !errors.form && 'invisible')}
      >
        {errors.form ?? ' '}
      </p>

      <Footer>
        {confirmDelete && rule ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-danger/30 bg-danger/[0.04] p-3">
            <p className="text-[13px] leading-5">
              <span className="font-semibold">
                Delete “{rule.note || rule.category_name || 'this item'}”?
              </span>{' '}
              It stops repeating. Entries already recorded stay in your history. This can’t be
              undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                autoFocus
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  await deleteRecurringRule(db, rule.id)
                  toast('Recurring item deleted (past entries kept)')
                  onDone()
                }}
              >
                <Trash2 /> Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {rule && (
              <>
                <Button
                  variant="danger"
                  size="lg"
                  className="w-12 px-0"
                  aria-label="Delete recurring item"
                  title="Delete recurring item"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-12 px-0 sm:w-auto sm:px-4"
                  aria-label={rule.paused_at ? 'Resume' : 'Pause'}
                  title={
                    rule.paused_at
                      ? 'Resume — nothing missed while paused is back-filled'
                      : 'Pause — stops reminders until you resume'
                  }
                  onClick={async () => {
                    await pauseRecurringRule(db, rule.id, !rule.paused_at, today)
                    toast(
                      rule.paused_at
                        ? `Resumed · ${rule.note || rule.category_name || 'Recurring item'}`
                        : `Paused · ${rule.note || rule.category_name || 'Recurring item'}`,
                    )
                    onDone()
                  }}
                >
                  {rule.paused_at ? <Play /> : <Pause />}
                  <span className="max-sm:hidden">{rule.paused_at ? 'Resume' : 'Pause'}</span>
                </Button>
              </>
            )}
            <SubmitButton busy={busy}>{rule ? 'Save changes' : 'Add recurring item'}</SubmitButton>
          </div>
        )}
      </Footer>
    </form>
  )
}

// ---------------------------------------------------------------- loans

/** Add / edit a fixed-EMI loan. Same rules as the phone app (createLoan / updateLoan / closeLoan). */
export function LoanForm({ loan, onDone }: { loan: LoanWithPayments | null; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const uid = useId()
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: parties } = useQuery<{ id: string; name: string }>(Q.parties)

  const [name, setName] = useState(loan?.name ?? '')
  const [lender, setLender] = useState(loan?.party_name ?? '')
  const [emi, setEmi] = useState(loan ? String(loan.emi_amount_minor / 100) : '')
  const [months, setMonths] = useState(loan?.total_installments ?? 12)
  const [firstDue, setFirstDue] = useState(loan?.first_due_date ?? today)
  const [paidBefore, setPaidBefore] = useState(loan?.installments_paid_before ?? 0)
  const [accountId, setAccountId] = useState<string | null>(loan ? loan.default_account_id : null)
  const [touchedAccount, setTouchedAccount] = useState(Boolean(loan))
  const [note, setNote] = useState(loan?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // New loans pre-select the first account (EMIs need one to be marked paid in one tap).
  const payFrom = touchedAccount ? accountId : (accounts[0]?.id ?? null)
  const clear = (...keys: string[]) =>
    setErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k) && k !== 'form')),
    )
  const parsedEmi = parseAmount(emi)
  const inApp = loan
    ? { count: loan.paid_count, amount: loan.paid_amount }
    : { count: 0, amount: 0 }
  const preview =
    parsedEmi.ok && /^\d{4}-\d{2}-\d{2}$/.test(firstDue)
      ? loanProgress(
          {
            emi_amount_minor: parsedEmi.minor,
            total_installments: months,
            first_due_date: firstDue,
            installments_paid_before: Math.min(paidBefore, months),
          },
          inApp.count,
          inApp.amount,
          today,
        )
      : null
  const save = async () => {
    if (busy) return
    const pre: Errors = {}
    if (!name.trim()) pre.name = 'Give the loan a name'
    if (!parsedEmi.ok)
      pre.emi_amount_minor =
        parsedEmi.error === 'precision'
          ? 'Up to 2 decimals, e.g. 8,500.50'
          : 'Enter the monthly EMI amount'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue))
      pre.first_due_date = 'Pick the date EMI #1 was or is due'
    if (Object.keys(pre).length) return setErrors(pre)
    setBusy(true)
    try {
      const typed = lender.trim()
      let partyId: string | null = null
      if (typed) {
        partyId =
          typed === loan?.party_name
            ? loan.party_id
            : (parties.find((p) => p.name.trim().toLowerCase() === typed.toLowerCase())?.id ??
              (await createParty(db, userId, { name: typed, kind: 'company' })))
      }
      const input = {
        name: name.trim(),
        party_id: partyId,
        emi_amount_minor: parsedEmi.ok ? parsedEmi.minor : 0,
        total_installments: months,
        first_due_date: firstDue,
        installments_paid_before: paidBefore,
        default_account_id: payFrom,
        note: note.trim() || null,
      }
      if (loan) {
        const before = loan
        await updateLoan(db, loan.id, input)
        toast(`${input.name} updated`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void updateLoan(db, before.id, {
                name: before.name,
                party_id: before.party_id,
                emi_amount_minor: before.emi_amount_minor,
                total_installments: before.total_installments,
                first_due_date: before.first_due_date,
                installments_paid_before: before.installments_paid_before,
                default_account_id: before.default_account_id,
                note: before.note,
              }),
          },
        })
      } else {
        await createLoan(db, userId, input)
        const next = preview?.nextDueDate
        toast(
          next
            ? `${input.name} added — next EMI ${shortDay(next, today)}${preview?.debtFreeBy ? ` · debt-free by ${monthYear(preview.debtFreeBy)}` : ''}`
            : `${input.name} added`,
        )
      }
      onDone()
    } catch (e) {
      setErrors(issuesOf(e))
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            autoFocus={!loan}
            aria-invalid={Boolean(errors.name) || undefined}
            value={name}
            maxLength={60}
            placeholder="Bike loan"
            onChange={(e) => (setName(e.target.value), clear('name'))}
          />
        </Field>
        <Field label="Lender · optional">
          <Input
            value={lender}
            maxLength={80}
            placeholder="City Bank"
            list={`${uid}-lenders`}
            autoComplete="off"
            onChange={(e) => setLender(e.target.value)}
          />
          <datalist id={`${uid}-lenders`}>
            {parties.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>
      </div>
      <FieldError message={errors.name} />

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-text-muted">Monthly EMI</span>
        <AmountInput
          label="Monthly EMI"
          currency={currency}
          value={emi}
          invalid={Boolean(errors.emi_amount_minor)}
          onChange={(v) => (setEmi(v), clear('emi_amount_minor'))}
        />
      </div>
      <FieldError message={errors.emi_amount_minor} />

      <div className="grid grid-cols-2 gap-3">
        <GroupField label="Total EMIs" hint="Tenure, in months">
          <Stepper
            label="Total EMIs"
            value={months}
            min={Math.max(1, loan ? paidBefore + loan.paid_count : 1)}
            max={600}
            onChange={(n) => {
              setMonths(n)
              setPaidBefore((p) => Math.min(p, n))
              clear('total_installments', 'installments_paid_before')
            }}
          />
        </GroupField>
        <GroupField label="Already paid before Hisab" hint="EMIs paid before you started">
          <Stepper
            label="EMIs already paid before Hisab"
            value={paidBefore}
            min={0}
            max={months - inApp.count}
            onChange={(n) => (setPaidBefore(n), clear('installments_paid_before'))}
          />
        </GroupField>
      </div>
      <FieldError message={errors.total_installments ?? errors.installments_paid_before} />

      <Field label="First EMI date" hint="When EMI #1 was or is due">
        <Input
          type="date"
          required
          aria-invalid={Boolean(errors.first_due_date) || undefined}
          value={firstDue}
          onChange={(e) => (setFirstDue(e.target.value), clear('first_due_date'))}
          className="num text-[14px]"
        />
      </Field>
      <FieldError message={errors.first_due_date} />

      <ChipGroup label="Paid from" hint="Pre-selected when you mark an EMI paid">
        {accounts.map((a) => (
          <Chip
            key={a.id}
            size="sm"
            selected={payFrom === a.id}
            onClick={() => {
              setTouchedAccount(true)
              setAccountId(payFrom === a.id ? null : a.id)
            }}
          >
            {a.name}
          </Chip>
        ))}
        {accounts.length === 0 && (
          <p className="py-1 text-[13px] text-text-muted">
            Add an account in Settings to mark EMIs paid in one tap.
          </p>
        )}
      </ChipGroup>

      <Input
        aria-label="Note"
        placeholder="Note (optional) — e.g. loan account number"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />

      <div
        aria-live="polite"
        className="min-h-[52px] rounded-[14px] bg-surface-muted px-4 py-3 text-[13px] leading-5 text-text-muted"
      >
        {preview ? (
          preview.monthsLeft === 0 ? (
            <span className="font-medium text-text">
              All {months} EMIs paid — nothing left on this loan.
            </span>
          ) : (
            <>
              <span className="font-semibold text-text">{preview.monthsLeft} left</span> ·{' '}
              <Money
                minor={preview.remainingAmount}
                currency={currency}
                grouping={grouping}
                className="font-semibold text-text"
              />{' '}
              left
              {preview.debtFreeBy && (
                <>
                  {' '}
                  · debt-free by{' '}
                  <span className="font-semibold text-text">{monthYear(preview.debtFreeBy)}</span>
                </>
              )}
              {preview.nextDueDate && (
                <span
                  className={cn(
                    'block text-[12.5px]',
                    preview.isOverdue ? 'font-medium text-danger' : 'text-text-faint',
                  )}
                >
                  {preview.isOverdue ? 'Overdue since' : 'Next EMI'}{' '}
                  {shortDay(preview.nextDueDate, today)} · EMI {preview.paid + 1} of {months}
                </span>
              )}
            </>
          )
        ) : (
          <span className="text-text-faint">
            Enter the EMI to see what’s left and when you’ll be debt-free.
          </span>
        )}
      </div>

      <p
        role="alert"
        className={cn('-my-1.5 min-h-5 text-[13px] text-danger', !errors.form && 'invisible')}
      >
        {errors.form ?? ' '}
      </p>

      <Footer>
        {confirmClose && loan ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface-muted/60 p-3">
            <p className="text-[13px] leading-5">
              <span className="font-semibold">Close “{loan.name}”?</span>{' '}
              {preview && preview.monthsLeft > 0
                ? `${preview.monthsLeft} EMIs are still open — close it only if it’s settled or you no longer track it. `
                : ''}
              It leaves Plan and Due soon; EMIs already recorded stay in your history.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                autoFocus
                onClick={() => setConfirmClose(false)}
              >
                Keep it
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  await closeLoan(db, loan.id, true)
                  toast(`${loan.name} closed`, {
                    action: { label: 'Undo', onClick: () => void closeLoan(db, loan.id, false) },
                  })
                  onDone()
                }}
              >
                Close loan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {loan && (
              <Button variant="outline" size="lg" onClick={() => setConfirmClose(true)}>
                Close loan
              </Button>
            )}
            <SubmitButton busy={busy}>{loan ? 'Save changes' : 'Add loan'}</SubmitButton>
          </div>
        )}
      </Footer>
    </form>
  )
}
