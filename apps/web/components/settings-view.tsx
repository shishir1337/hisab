'use client'

import { parseAmount, toCsv } from '@hisab/core'
import {
  archiveAccount,
  clearIssues,
  createAccount,
  describeIssue,
  discardIssue,
  Q,
  saveProfile,
  updateAccount,
  ValidationError,
  type AccountWithBalance,
  type UploadIssue,
} from '@hisab/db'
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
import { usePrivacy } from '@/lib/privacy'
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

const EXPORT_TABLES = [
  'profiles',
  'accounts',
  'categories',
  'parties',
  'transactions',
  'recurring_rules',
  'recurring_skips',
  'loans',
  'lendings',
  'lending_reminders_sent',
  'budgets',
] as const

export function SettingsView() {
  const db = usePowerSync()
  const router = useRouter()
  const { userId, currency, grouping, timeZone, displayName } = useProfile()
  const { hidden, toggle } = usePrivacy()
  const { theme = 'system', setTheme } = useTheme()
  const { data: issues } = useQuery<UploadIssue>(Q.uploadIssues)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const browserTz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const pref = (patch: Parameters<typeof saveProfile>[2]) =>
    void saveProfile(db, userId, patch).catch((e) =>
      toast(e instanceof Error ? e.message : 'Couldn’t save'),
    )

  const [signingOut, setSigningOut] = useState(false)
  // Unsynced changes counted when "remove data" is clicked; non-null = asking for confirmation.
  const [wipeAsk, setWipeAsk] = useState<number | null>(null)
  const askWipe = async () => {
    const [pending, parked] = await Promise.all([
      db.get<{ n: number }>('select count(*) as n from ps_crud').catch(() => ({ n: 0 })),
      db.get<{ n: number }>('select count(*) as n from upload_issues').catch(() => ({ n: 0 })),
    ])
    setWipeAsk(pending.n + parked.n)
  }
  const signOut = async (wipe: boolean) => {
    if (signingOut) return
    setSigningOut(true)
    if (wipe) {
      try {
        await db.disconnectAndClear()
      } catch {
        setSigningOut(false)
        return toast('Couldn’t remove the data from this browser. You’re still signed in.')
      }
    }
    const { error } = await getSupabase().auth.signOut()
    if (error) await getSupabase().auth.signOut({ scope: 'local' })
    router.replace('/sign-in')
    router.refresh()
  }

  const deleteAccount = async () => {
    if (confirm !== 'DELETE' || deleting) return
    setDeleting(true)
    const { error } = await getSupabase().functions.invoke('delete-account', {
      body: { confirm: 'DELETE' },
    })
    if (error) {
      setDeleting(false)
      return toast('Couldn’t delete the account. Check your connection and try again.')
    }
    await db.disconnectAndClear().catch(() => {})
    await getSupabase().auth.signOut({ scope: 'local' })
    router.replace('/sign-in')
  }
  const { data: accounts } = useQuery<AccountWithBalance>(Q.accountsWithBalance)
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null)

  const exportAll = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const files: Record<string, Uint8Array> = {}
      for (const t of EXPORT_TABLES) {
        const rows = await db.getAll<Record<string, unknown>>(`select * from ${t}`)
        const cols = rows[0] ? Object.keys(rows[0]) : ['id']
        files[`${t}.csv`] = strToU8(
          '\uFEFF' +
            toCsv(
              cols,
              rows.map((r) => cols.map((c) => r[c] as string | number | null)),
            ),
        )
      }
      download(
        new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }),
        `hisab-export-${new Date().toISOString().slice(0, 10)}.zip`,
      )
      toast('Export downloaded')
    } catch {
      toast('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Section title="Accounts">
        <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface px-4">
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setEditing(a)}
                className={`flex w-full items-center gap-3 py-3 text-left ${a.archived ? 'opacity-50' : ''}`}
              >
                <span className="flex-1">
                  <span className="block text-[14px] font-medium">{a.name}</span>
                  <span className="block text-[12px] text-text-faint">
                    {a.archived ? 'Archived' : TYPES.find(([t]) => t === a.type)?.[1]}
                  </span>
                </span>
                <Money
                  minor={a.balance_minor}
                  currency={currency}
                  grouping={grouping}
                  className="text-[14px] font-semibold"
                />
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={() => setEditing('new')}
              className="flex w-full items-center gap-2 py-3 text-[14px] font-semibold"
            >
              <Plus className="size-4" /> Add account
            </button>
          </li>
        </ul>
      </Section>

      <Section title="Money">
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
          <div>
            <p className="mb-2 text-[12.5px] text-text-muted">Currency</p>
            <div className="flex flex-wrap gap-2">
              {['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR'].map((c) => (
                <Chip key={c} selected={currency === c} onClick={() => pref({ base_currency: c })}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12.5px] text-text-muted">Number style</p>
            <div className="flex gap-2">
              <Chip
                selected={grouping === 'south_asian'}
                onClick={() => pref({ number_grouping: 'south_asian' })}
              >
                2,48,350
              </Chip>
              <Chip
                selected={grouping === 'western'}
                onClick={() => pref({ number_grouping: 'western' })}
              >
                248,350
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12.5px] text-text-muted">Time zone · {timeZone}</p>
            <div className="flex flex-wrap gap-2">
              {[
                ...new Set([
                  browserTz,
                  'Asia/Dhaka',
                  'Asia/Kolkata',
                  'Asia/Dubai',
                  'Europe/London',
                  'America/New_York',
                ]),
              ].map((tz) => (
                <Chip key={tz} selected={timeZone === tz} onClick={() => pref({ timezone: tz })}>
                  {tz.split('/').pop()!.replace('_', ' ')}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Privacy">
        <label className="flex items-center justify-between rounded-card border border-border bg-surface p-4">
          <span>
            <span className="block text-[14px] font-medium">Hide amounts</span>
            <span className="block text-[12.5px] text-text-faint">
              Or click the balance card. Synced to your phone.
            </span>
          </span>
          <input
            type="checkbox"
            checked={hidden}
            onChange={toggle}
            className="size-5 accent-[var(--brand)]"
          />
        </label>
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
        <p className="mb-3 text-[13.5px] text-text-muted">
          Download everything as CSV files (one per table) in a ZIP. It’s generated in your browser.
        </p>
        <Button variant="outline" onClick={() => void exportAll()} disabled={exporting}>
          <Download /> {exporting ? 'Preparing…' : 'Export all data'}
        </Button>
        {issues.length > 0 && (
          <div className="mt-4 rounded-card border border-border bg-surface p-4">
            <p className="text-[14px] font-semibold">
              {issues.length} change{issues.length === 1 ? '' : 's'} couldn’t sync
            </p>
            <p className="mb-3 text-[12.5px] text-text-muted">
              The server refused these changes, so they were undone. Re-enter any you still need — your other data is fine.
            </p>
            <ul className="divide-y divide-border-subtle">
              {issues.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{describeIssue(i)}</span>
                    <span className="block truncate text-[12px] text-text-faint">{i.message}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void discardIssue(db, i.id)}>
                    Dismiss
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={() => void clearIssues(db)}>
              Dismiss all
            </Button>
          </div>
        )}
      </Section>

      <Section title="Account">
        <label className="mb-3 block max-w-sm">
          <span className="mb-1 block text-[12.5px] text-text-muted">Your name</span>
          <Input
            key={displayName ?? ''}
            defaultValue={displayName ?? ''}
            placeholder="What should Hisab call you?"
            maxLength={80}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (displayName ?? '')) pref({ display_name: v || null })
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void signOut(false)} disabled={signingOut}>
            <LogOut /> Sign out
          </Button>
          {wipeAsk === null && (
            <Button variant="ghost" onClick={() => void askWipe()} disabled={signingOut}>
              Sign out and remove data from this browser
            </Button>
          )}
        </div>
        {wipeAsk !== null && (
          <div className="mt-3 rounded-card border border-border bg-surface p-4">
            <p className={wipeAsk > 0 ? 'text-[13.5px] text-danger' : 'text-[13.5px]'}>
              {wipeAsk > 0
                ? `${wipeAsk} ${wipeAsk === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet and will be lost. Stay online until they sync to keep ${wipeAsk === 1 ? 'it' : 'them'}.`
                : 'Everything is synced. Remove Hisab’s data from this browser (for a shared computer) and sign out?'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setWipeAsk(null)}>
                Cancel
              </Button>
              <Button onClick={() => void signOut(true)} disabled={signingOut}>
                {wipeAsk > 0 ? 'Remove anyway' : 'Remove & sign out'}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Danger zone">
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold text-danger">Delete my account</p>
          <p className="mt-0.5 mb-3 text-[12.5px] text-text-muted">
            Permanently deletes your account and all your data. Type DELETE to confirm — this can’t
            be undone.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Type DELETE to confirm"
              placeholder="DELETE"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="max-w-48"
            />
            <Button
              variant="outline"
              className="text-danger"
              disabled={confirm !== 'DELETE' || deleting}
              onClick={() => void deleteAccount()}
            >
              {deleting ? 'Deleting…' : 'Delete forever'}
            </Button>
          </div>
        </div>
      </Section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === 'new' ? 'New account' : 'Edit account'}>
            <AccountForm
              account={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function AccountForm({
  account,
  onDone,
}: {
  account: AccountWithBalance | null
  onDone: () => void
}) {
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [opening, setOpening] = useState(
    account && account.opening_balance_minor !== 0
      ? String(Math.abs(account.opening_balance_minor) / 100)
      : '',
  )
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
      setError(
        e instanceof ValidationError
          ? e.messageFor('name')
            ? 'Give the account a name'
            : e.issues[0]!.message
          : 'Couldn’t save',
      )
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
      <Input
        aria-label="Name"
        autoFocus
        placeholder="Name (e.g. City Bank)"
        value={name}
        onChange={(e) => (setName(e.target.value), setError(null))}
      />
      <label className="text-[12.5px] text-text-muted">
        {account ? 'Opening balance' : 'Balance right now'}
        {account && (
          <span className="ml-2 text-text-faint">
            (now <Money minor={account.balance_minor} currency={currency} grouping={grouping} />)
          </span>
        )}
        <Input
          aria-label="Balance"
          inputMode="decimal"
          placeholder="0"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          className="mt-1"
        />
      </label>
      {type === 'card' && (
        <label className="flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={owed}
            onChange={(e) => setOwed(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />{' '}
          This is money I owe (credit card)
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
              toast(account.archived ? 'Account restored' : 'Account archived', {
                action: {
                  label: 'Undo',
                  onClick: () => void archiveAccount(db, account.id, Boolean(account.archived)),
                },
              })
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
      <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}
