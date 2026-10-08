'use client'

import { dayLabel, monthLabel, monthRange, totalEffect } from '@hisab/core'
import { bulkRecategorizeWithUndo, bulkRestore, bulkSetCategories, bulkSoftDelete, Q, type CategoryOption, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { ArrowDown, ArrowUp, Plus, Search, SearchX, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/toaster'
import { labelFor, TxLine, txTitle } from '@/components/dashboard'
import { Money } from '@/components/money'
import { MonthStepper } from '@/components/month-stepper'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/card'
import { CategoryIcon } from '@/components/ui/category-icon'
import { EmptyMonthArt } from '@/components/ui/illustrations'
import { TxSkeleton } from '@/components/ui/skeleton'
import { PillSelect } from '@/components/ui/chip'
import { useIsTouch } from '@/lib/data'
import { useListMotion } from '@/lib/motion'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

type SortKey = 'date' | 'amount'
type Sort = { key: SortKey; dir: 1 | -1 }
const EDITABLE = new Set(['expense', 'income', 'transfer'])
const SORTS: { id: string; label: string; sort: Sort }[] = [
  { id: 'date-desc', label: 'Newest first', sort: { key: 'date', dir: -1 } },
  { id: 'date-asc', label: 'Oldest first', sort: { key: 'date', dir: 1 } },
  { id: 'amount-desc', label: 'Largest first', sort: { key: 'amount', dir: -1 } },
  { id: 'amount-asc', label: 'Smallest first', sort: { key: 'amount', dir: 1 } },
]
const sortId = (s: Sort) => `${s.key}-${s.dir === -1 ? 'desc' : 'asc'}`
const shortDate = (d: string) => `${Number(d.slice(8))} ${monthLabel(d).slice(0, 3)}`

/** Activity (spec §7.4): grouped by day; a dense multi-select table on desktop, a list on phones. */
export function ActivityTable() {
  const db = usePowerSync()
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const touch = useIsTouch()
  const quickLog = useQuickLog()
  const [month, setMonth] = useState(() => monthRange(today).start)
  const { start, end } = monthRange(month)
  const { data: rows, isLoading } = useQuery<TransactionView>(Q.transactionsBetween, [start, end])
  const { data: summary } = useQuery<{ income: number; expense: number }>(Q.monthSummary, [start, end])
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: expenseCats } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: incomeCats } = useQuery<CategoryOption>(Q.categories, ['income'])

  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const filtering = Boolean(q || type || account || category)
  const tableMotion = useListMotion<HTMLDivElement>(month)
  const listMotion = useListMotion<HTMLDivElement>(month)
  const loading = isLoading && rows.length === 0

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = rows.filter(
      (t) =>
        (!type || t.type === type) &&
        (!account || t.account_id === account || t.to_account_id === account) &&
        (!category || t.category_id === category) &&
        (!needle || [t.note, t.category_name, t.account_name, t.party_name].some((v) => v?.toLowerCase().includes(needle))),
    )
    if (sort.key === 'amount') out.sort((a, b) => sort.dir * (a.amount_minor - b.amount_minor))
    else if (sort.dir === 1) out.reverse()
    return out
  }, [rows, q, type, account, category, sort])

  // Consecutive rows of the same day → one group (only when ordered by date).
  const groups = useMemo(() => {
    if (sort.key !== 'date') return [{ day: '', rows: visible, net: 0 }]
    const out: { day: string; rows: TransactionView[]; net: number }[] = []
    for (const t of visible) {
      const last = out[out.length - 1]
      if (last && last.day === t.occurred_on) {
        last.rows.push(t)
        last.net += totalEffect(t)
      } else out.push({ day: t.occurred_on, rows: [t], net: totalEffect(t) })
    }
    return out
  }, [visible, sort.key])
  const grouped = sort.key === 'date'

  // Selection never outlives what's on screen (month / filter changes clear it).
  useEffect(() => setSelected(new Set()), [month, q, type, account, category])
  const selectable = visible.filter((t) => EDITABLE.has(t.type))
  const chosen = selectable.filter((t) => selected.has(t.id)).map((t) => t.id)
  const allChecked = selectable.length > 0 && selectable.every((t) => selected.has(t.id))
  const someChecked = chosen.length > 0 && !allChecked
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const deleteSelected = async () => {
    const ids = chosen
    const n = await bulkSoftDelete(db, ids)
    setSelected(new Set())
    toast(`Deleted ${n}`, { action: { label: 'Undo', onClick: () => void bulkRestore(db, ids) } })
  }
  const recategorize = async (categoryId: string) => {
    const ids = chosen
    const before = await bulkRecategorizeWithUndo(db, ids, categoryId)
    const n = Object.keys(before).length
    toast(n === ids.length ? `Recategorized ${n}` : `Recategorized ${n} of ${ids.length} (only matching expense/income rows)`, {
      action: { label: 'Undo', onClick: () => void bulkSetCategories(db, before) },
    })
    setSelected(new Set())
  }
  const clearFilters = () => {
    setQ('')
    setType('')
    setAccount('')
    setCategory('')
  }

  const income = summary[0]?.income ?? 0
  const expense = summary[0]?.expense ?? 0
  const edit = (t: TransactionView) => EDITABLE.has(t.type) && quickLog.open({ edit: t })

  const empty =
    visible.length === 0 && !isLoading ? (
      rows.length === 0 ? (
        <EmptyState
          illustration={<EmptyMonthArt />}
          title={`Nothing logged in ${monthLabel(month)}`}
          action={
            month === monthRange(today).start ? (
              <Button variant="outline" size="sm" onClick={() => quickLog.open()}>
                <Plus /> Log money
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setMonth(monthRange(today).start)}>
                Back to {monthLabel(today)}
              </Button>
            )
          }
        >
          {month === monthRange(today).start ? (touch ? 'Tap + to log your first one this month.' : 'Press N to log your first one this month.') : 'Nothing was recorded this month.'}
        </EmptyState>
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="Nothing matches these filters"
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )
    ) : null

  return (
    <div className="flex flex-col gap-4">
      {/* Month + totals */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MonthStepper month={month} onChange={setMonth} max={monthRange(today).start} className="self-start" />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-border bg-border text-[13px] sm:flex sm:gap-0 sm:border-0 sm:bg-transparent">
          <Total label="In">
            <Money minor={income} currency={currency} grouping={grouping} animate className={cn('font-semibold', income > 0 && 'text-positive')} />
          </Total>
          <Total label="Out">
            <Money minor={expense} currency={currency} grouping={grouping} animate className="font-semibold" />
          </Total>
        </dl>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-border bg-surface px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-text-faint focus-within:ring-4 focus-within:ring-brand/[0.06] md:w-72 lg:w-80">
          <Search className="size-4 shrink-0 text-text-faint" />
          <input
            aria-label="Search"
            placeholder="Search notes, categories, people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-text-faint"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="grid size-6 place-items-center rounded-full text-text-faint hover:bg-surface-muted hover:text-text">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <div className="no-scrollbar fade-x -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:flex-1 md:overflow-visible md:px-0 md:[mask-image:none]">
          <PillSelect aria-label="Type" value={type} active={Boolean(type)} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {(['expense', 'income', 'transfer', 'emi', 'lending_out', 'lending_in'] as const).map((t) => (
              <option key={t} value={t}>
                {labelFor(t)}
              </option>
            ))}
          </PillSelect>
          <PillSelect aria-label="Account" value={account} active={Boolean(account)} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </PillSelect>
          <PillSelect aria-label="Category" value={category} active={Boolean(category)} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <optgroup label="Expense">
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Income">
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </optgroup>
          </PillSelect>
          <PillSelect aria-label="Sort" value={sortId(sort)} onChange={(e) => setSort(SORTS.find((s) => s.id === e.target.value)!.sort)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </PillSelect>
          {filtering && (
            <button type="button" onClick={clearFilters} className="h-9 shrink-0 rounded-full px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text">
              Clear all
            </button>
          )}
          {filtering && (
            <span className="ml-auto hidden shrink-0 text-[12.5px] text-text-faint md:inline">
              {visible.length} of {rows.length}
            </span>
          )}
        </div>
      </div>

      {/* Bulk actions (desktop selection) */}
      {chosen.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="hidden items-center gap-2 rounded-[14px] bg-text py-2 pr-2 pl-4 text-page shadow-[var(--shadow-pop)] md:flex">
          <span className="num text-[13px] font-semibold">{chosen.length} selected</span>
          <span className="relative ml-auto inline-flex">
            <select
              aria-label="Recategorize"
              value=""
              onChange={(e) => e.target.value && void recategorize(e.target.value)}
              className="h-8 appearance-none rounded-[9px] bg-page/10 pr-3 pl-3 text-[13px] font-medium text-page outline-none hover:bg-page/20 [&>optgroup]:text-text [&>option]:text-text"
            >
              <option value="">Move to category…</option>
              <optgroup label="Expense">
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Income">
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </span>
          <button onClick={() => void deleteSelected()} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-page/10 px-3 text-[13px] font-medium hover:bg-page/20">
            <Trash2 className="size-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="grid size-8 place-items-center rounded-[9px] opacity-70 hover:bg-page/10 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Desktop: table */}
      <div ref={tableMotion} className="relative hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <table className="w-full table-fixed text-[13.5px]">
          <colgroup>
            <col className="w-12" />
            {!grouped && <col className="w-24" />}
            <col />
            <col className="w-[22%]" />
            <col className="w-[16%]" />
            <col className="w-36" />
          </colgroup>
          <thead className="border-b border-border text-left text-[12px] text-text-faint">
            <tr>
              <th className="py-2.5 pr-2 pl-5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked
                  }}
                  disabled={selectable.length === 0}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((t) => t.id)))}
                  className="checkbox"
                />
              </th>
              {!grouped && <th className="px-3 py-2.5 font-medium">Date</th>}
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="py-2.5 pr-5 pl-3 text-right font-medium" aria-sort={sort.key === 'amount' ? (sort.dir === -1 ? 'descending' : 'ascending') : 'none'}>
                <button
                  className="inline-flex items-center gap-1 rounded-[6px] transition-colors hover:text-text"
                  onClick={() => setSort((s) => ({ key: 'amount', dir: s.key === 'amount' ? ((-s.dir) as 1 | -1) : -1 }))}
                >
                  {sort.key === 'amount' && (sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  Amount
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {empty && (
              <tr>
                <td colSpan={grouped ? 5 : 6}>{empty}</td>
              </tr>
            )}
            {loading &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={`sk${i}`} aria-hidden className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-2 pl-5">
                    <span className="skeleton block size-4 rounded-[5px]" />
                  </td>
                  {!grouped && <td className="px-3 py-2" />}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="skeleton size-7 shrink-0 rounded-[8px]" />
                      <span className="skeleton block h-3.5" style={{ width: `${[46, 34, 58, 40, 52, 30][i]}%` }} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="skeleton block h-3 w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <span className="skeleton block h-3 w-14" />
                  </td>
                  <td className="py-2 pr-5 pl-3">
                    <span className="skeleton ml-auto block h-3.5 w-16" />
                  </td>
                </tr>
              ))}
            {groups.map((g) => (
              <Fragment key={g.day || 'all'}>
                {grouped && (
                  <tr data-flip-key={`day:${g.day}`} className="border-b border-border-subtle bg-surface-muted/60">
                    <td colSpan={4} className="py-2 pr-3 pl-5 text-[12.5px] font-semibold text-text-muted">
                      {dayLabel(g.day, today)}
                    </td>
                    <td className="py-2 pr-5 pl-3 text-right text-[12.5px] text-text-faint">
                      {g.net !== 0 && <Money minor={g.net} currency={currency} grouping={grouping} sign="always" hideCode className="font-medium" />}
                    </td>
                  </tr>
                )}
                {g.rows.map((t) => {
                  const effect = totalEffect(t)
                  const transfer = t.type === 'transfer'
                  const editable = EDITABLE.has(t.type)
                  const title = txTitle(t)
                  return (
                    <tr
                      key={t.id}
                      data-flip-key={t.id}
                      tabIndex={editable ? 0 : undefined}
                      aria-label={editable ? `Edit ${title}` : undefined}
                      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && edit(t)}
                      onClick={() => edit(t)}
                      className={cn(
                        'border-b border-border-subtle transition-colors duration-100 last:border-0 focus-visible:-outline-offset-2',
                        editable && 'cursor-pointer hover:bg-surface-muted/70',
                        selected.has(t.id) && 'bg-surface-muted',
                      )}
                    >
                      <td className="py-2 pr-2 pl-5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${title}`}
                          disabled={!editable}
                          title={editable ? undefined : 'Manage EMI / lending entries from Plan or People'}
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                          className="checkbox"
                        />
                      </td>
                      {!grouped && <td className="num px-3 py-2 whitespace-nowrap text-text-muted">{shortDate(t.occurred_on)}</td>}
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryIcon icon={t.category_icon ?? (t.type === 'emi' ? '🏦' : null)} color={t.category_color} transfer={transfer} size="sm" />
                          <span className="truncate font-medium" title={title}>
                            {title}
                          </span>
                        </div>
                      </td>
                      <td className="truncate px-3 py-2 text-text-muted" title={t.category_name ?? undefined}>
                        {t.category_name ?? labelFor(t.type)}
                      </td>
                      <td className="truncate px-3 py-2 text-text-muted">{transfer ? <span className="text-text-faint">—</span> : t.account_name}</td>
                      <td className="py-2 pr-5 pl-3 text-right whitespace-nowrap">
                        <Money
                          minor={transfer ? t.amount_minor : effect}
                          currency={currency}
                          grouping={grouping}
                          sign={transfer ? 'never' : 'always'}
                          hideCode
                          className={cn('font-semibold', transfer ? 'text-text-faint' : effect > 0 ? 'text-positive' : '')}
                        />
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: grouped list */}
      <div ref={listMotion} className="flex flex-col gap-5 md:hidden">
        {loading && <TxSkeleton count={6} className="rounded-card border border-border bg-surface p-1.5" />}
        {empty && <div className="rounded-card border border-border bg-surface">{empty}</div>}
        {visible.length > 0 &&
          groups.map((g) => (
            <section key={g.day || 'all'} aria-label={grouped ? dayLabel(g.day, today) : 'Transactions'}>
              {grouped && (
                <div data-flip-key={`day:${g.day}`} className="mb-2 flex items-baseline justify-between px-1 text-[12.5px]">
                  <h2 className="font-semibold text-text-muted">{dayLabel(g.day, today)}</h2>
                  {g.net !== 0 && <Money minor={g.net} currency={currency} grouping={grouping} sign="always" hideCode className="font-medium text-text-faint" />}
                </div>
              )}
              <ul className="flex flex-col rounded-card border border-border bg-surface p-1.5">
                {g.rows.map((t) => (
                  <li key={t.id} data-flip-key={t.id} className="rounded-[12px]">
                    <TxLine tx={t} showDate={grouped ? undefined : shortDate(t.occurred_on)} onClick={EDITABLE.has(t.type) ? () => edit(t) : undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  )
}

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-surface px-3 py-2 sm:flex-row sm:items-baseline sm:gap-1.5 sm:bg-transparent sm:px-0 sm:py-0 sm:pl-5">
      <dt className="text-[12px] text-text-faint sm:text-[13px]">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
