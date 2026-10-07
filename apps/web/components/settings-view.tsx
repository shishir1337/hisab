'use client'

import { parseAmount, toCsv } from '@hisab/core'
import { archiveAccount, createAccount, Q, updateAccount, ValidationError, type AccountWithBalance } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { strToU8, zipSync } from 'fflate'
import { Download, LogOut, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/money'
import { download } from '@/components/report-view'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/lib/profile'
import { getSupabase } from '@/lib/supabase/client'

const TYPES = [
  ['cash', 'Cash'],
  ['bank', 'Bank'],
  ['mobile_wallet', 'Mobile wallet'],
  ['card', 'Card'],
  ['savings', 'Savings'],
] as const
type AccountType = (typeof TYPES)[number][0]

const EXPORT_TABLES = ['accounts', 'categories', 'parties', 'transactions', 'recurring_rules', 'recurring_skips', 'loans', 'lendings', 'lending_reminders_sent', 'budgets'] as const

export function SettingsView() {
  const db = usePowerSync()
  const router = useRouter()
  const { currency, grouping } = useProfile()
  const { theme = 'system', setTheme } = useTheme()
  const { data: accounts } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null)

  const exportAll = async () => {
    const files: Record<string, Uint8Array> = {}
    for (const t of EXPORT_TABLES) {
      const rows = await db.getAll<Record<string, unknown>>(`select * from ${t}`)
      const cols = rows[0] ? Object.keys(rows[0]) : ['id']
      files[`${t}.csv`] = strToU8(toCsv(cols, rows.map((r) => cols.map((c) => r[c] as string | number | null))))
    }
    download(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `hisab-export-${new Date().toISOString().slice(0, 10)}.zip`)
    toast('Export downloaded')
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Section title="Accounts">
        <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface px-4">
          {accounts.map((a) => (
            <li key={a.id}>
              <button onClick={() => setEditing(a)} className={`flex w-full items-center gap-3 py-3 text-left ${a.archived ? 'opacity-50' : ''}`}>
                <span className="flex-1">
                  <span className="block text-[14px] font-medium">{a.name}</span>
                  <span className="block text-[12px] text-text-faint">{a.archived ? 'Archived' : TYPES.find(([t]) => t === a.type)?.[1]}</span>
                </span>
                <Money minor={a.balance_minor} currency={currency} grouping={grouping} className="text-[14px] font-semibold" />
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => setEditing('new')} className="flex w-full items-center gap-2 py-3 text-[14px] font-semibold">
              <Plus className="size-4" /> Add account
            </button>
          </li>
        </ul>
      </Section>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Chip key={t} selected={theme === t} onClick={() => setTheme(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Your data">
        <p className="mb-3 text-[13.5px] text-text-muted">Download everything as CSV files (one per table) in a ZIP. It’s generated in your browser.</p>
        <Button variant="outline" onClick={() => void exportAll()}>
          <Download /> Export all data
        </Button>
      </Section>

      <Section title="Account">
        <Button
          variant="outline"
          onClick={async () => {
            await getSupabase().auth.signOut()
            router.replace('/sign-in')
            router.refresh()
          }}
        >
          <LogOut /> Sign out
        </Button>
      </Section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === 'new' ? 'New account' : 'Edit account'}>
            <AccountForm account={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function AccountForm({ account, onDone }: { account: AccountWithBalance | null; onDone: () => void }) {
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [opening, setOpening] = useState(account && account.opening_balance_minor !== 0 ? String(Math.abs(account.opening_balance_minor) / 100) : '')
  const [owed, setOwed] = useState((account?.opening_balance_minor ?? 0) < 0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    let minor = 0
    if (opening.trim() && opening.trim() !== '0') {
      const p = parseAmount(opening)
      if (!p.ok) return setError('Enter the balance as a number')
      minor = owed && type === 'card' ? -p.minor : p.minor
    }
    setBusy(true)
    try {
      const input = { name, type, opening_balance_minor: minor }
      if (account) await updateAccount(db, account.id, input)
      else await createAccount(db, userId, input)
      onDone()
    } catch (e) {
      setError(e instanceof ValidationError ? (e.messageFor('name') ? 'Give the account a name' : e.issues[0]!.message) : 'Couldn’t save')
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="flex flex-wrap gap-2">
        {TYPES.map(([t, label]) => (
          <Chip key={t} selected={type === t} onClick={() => setType(t)}>
            {label}
          </Chip>
        ))}
      </div>
      <Input aria-label="Name" autoFocus placeholder="Name (e.g. City Bank)" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
      <label className="text-[12.5px] text-text-muted">
        {account ? 'Opening balance' : 'Balance right now'}
        {account && (
          <span className="ml-2 text-text-faint">
            (now <Money minor={account.balance_minor} currency={currency} grouping={grouping} />)
          </span>
        )}
        <Input aria-label="Balance" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} className="mt-1" />
      </label>
      {type === 'card' && (
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={owed} onChange={(e) => setOwed(e.target.checked)} className="size-4 accent-[var(--brand)]" /> This is money I owe (credit card)
        </label>
      )}
      <p role="alert" className="min-h-5 text-[13px] text-danger">
        {error ?? ''}
      </p>
      <div className="flex gap-2">
        {account && (
          <Button
            variant="outline"
            onClick={async () => {
              await archiveAccount(db, account.id, !account.archived)
              toast(account.archived ? 'Account restored' : 'Account archived', { action: { label: 'Undo', onClick: () => void archiveAccount(db, account.id, Boolean(account.archived)) } })
              onDone()
            }}
          >
            {account.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={busy}>
          {account ? 'Save changes' : 'Add account'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}
