'use client'

import { addMonths, monthLabel, monthRange, totalEffect } from '@hisab/core'
import { bulkRecategorizeWithUndo, bulkRestore, bulkSetCategories, bulkSoftDelete, Q, type CategoryOption, type TransactionView } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { labelFor } from '@/components/dashboard'
import { Money } from '@/components/money'
import { useQuickLog } from '@/components/quick-log/quick-log'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/chip'
import { useProfile, useToday } from '@/lib/profile'
import { cn } from '@/lib/utils'

type SortKey = 'date' | 'amount'
const EDITABLE = new Set(['expense', 'income', 'transfer'])

/** Dense, filterable, multi-select Activity table (spec §7.4). */
export function ActivityTable() {
  const db = usePowerSync()
  const { currency, grouping, timeZone } = useProfile()
  const today = useToday(timeZone)
  const quickLog = useQuickLog()
  const [month, setMonth] = useState(() => monthRange(today).start)
  const { start, end } = monthRange(month)
  const { data: rows } = useQuery<TransactionView>(Q.transactionsBetween, [start, end])
  const { data: summary } = useQuery<{ income: number; expense: number }>(Q.monthSummary, [start, end])
  const { data: accounts } = useQuery<{ id: string; name: string }>(Q.activeAccounts)
  const { data: expenseCats } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: incomeCats } = useQuery<CategoryOption>(Q.categories, ['income'])

  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())

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

  // Selection never outlives what's on screen (month / filter changes clear it).
  useEffect(() => setSelected(new Set()), [month, q, type, account, category])
  const selectable = visible.filter((t) => EDITABLE.has(t.type))
  const chosen = selectable.filter((t) => selected.has(t.id)).map((t) => t.id)
  const allChecked = selectable.length > 0 && selectable.every((t) => selected.has(t.id))
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

  const isCurrent = month === monthRange(today).start
  const headerSort = (key: SortKey, label: string, className?: string) => (
    <th className={cn('px-3 py-2.5 font-medium', className)} aria-sort={sort.key === key ? (sort.dir === -1 ? 'descending' : 'ascending') : 'none'}>
      <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </Button>
          <span className="w-24 text-center text-[14px] font-semibold">{monthLabel(month)}</span>
          <Button variant="outline" size="icon" aria-label="Next month" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex gap-5 text-[13px]">
          <span>
            <span className="text-text-faint">In </span>
            <Money minor={summary[0]?.income ?? 0} currency={currency} grouping={grouping} className="font-semibold text-positive" />
          </span>
          <span>
            <span className="text-text-faint">Out </span>
            <Money minor={summary[0]?.expense ?? 0} currency={currency} grouping={grouping} className="font-semibold" />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-[12px] border border-border bg-surface px-3">
          <Search className="size-4 text-text-faint" />
          <input aria-label="Search" placeholder="Search notes, categories, people…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-[14px] outline-none placeholder:text-text-faint" />
        </label>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(['expense', 'income', 'transfer', 'emi', 'lending_out', 'lending_in'] as const).map((t) => (
            <option key={t} value={t}>
              {labelFor(t)}
            </option>
          ))}
        </Select>
        <Select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {[...expenseCats, ...incomeCats].map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </div>

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-text px-4 py-2.5 text-page">
          <span className="text-[13px] font-semibold">{chosen.length} selected</span>
          <Select aria-label="Recategorize" value="" onChange={(e) => e.target.value && void recategorize(e.target.value)} className="ml-auto h-9 border-transparent bg-white/10 text-page">
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
          </Select>
          <button onClick={() => void deleteSelected()} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white/10 px-3 text-[13px] font-semibold hover:bg-white/20">
            <Trash2 className="size-4" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="h-9 px-2 text-[13px] opacity-70 hover:opacity-100">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead className="border-b border-border text-left text-[12px] text-text-muted">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((t) => t.id)))}
                  className="size-4 accent-[var(--brand)]"
                />
              </th>
              {headerSort('date', 'Date', 'w-28')}
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              {headerSort('amount', 'Amount', 'text-right')}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-14 text-center text-text-muted">
                  {rows.length === 0 ? `No transactions in ${monthLabel(month)}. Press N to log one.` : 'Nothing matches these filters.'}
                </td>
              </tr>
            )}
            {visible.map((t) => {
              const effect = totalEffect(t)
              const transfer = t.type === 'transfer'
              return (
                <tr
                  key={t.id}
                  tabIndex={EDITABLE.has(t.type) ? 0 : undefined}
                  aria-label={EDITABLE.has(t.type) ? `Edit ${t.note || t.category_name || labelFor(t.type)}` : undefined}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && EDITABLE.has(t.type) && quickLog.open({ edit: t })}
                  onClick={() => EDITABLE.has(t.type) && quickLog.open({ edit: t })}
                  className={cn('border-b border-border-subtle last:border-0', EDITABLE.has(t.type) && 'cursor-pointer hover:bg-surface-muted/60', selected.has(t.id) && 'bg-surface-muted')}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      disabled={!EDITABLE.has(t.type)}
                      title={EDITABLE.has(t.type) ? undefined : 'Manage EMI / lending entries from Plan or People'}
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="size-4 accent-[var(--brand)] disabled:opacity-30"
                    />
                  </td>
                  <td className="num px-3 py-2.5 whitespace-nowrap text-text-muted">{t.occurred_on.slice(8)} {monthLabel(t.occurred_on).slice(0, 3)}</td>
                  <td className="max-w-[280px] truncate px-3 py-2.5">{transfer ? `${t.account_name} → ${t.to_account_name}` : t.note || t.party_name || labelFor(t.type)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{t.category_name ? `${t.category_icon ?? ''} ${t.category_name}` : labelFor(t.type)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{transfer ? '—' : t.account_name}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
