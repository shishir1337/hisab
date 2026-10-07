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
import { Banknote, ChevronRight, CreditCard, Download, Landmark, LogOut, PiggyBank, Plus, Smartphone, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/money'
import { download } from '@/components/report-view'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Dialog, DialogContent, Field } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { usePrivacy } from '@/lib/privacy'
import { useProfile, useUserEmail } from '@/lib/profile'
import { getSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TYPES = [
  ['cash', 'Cash'],
  ['bank', 'Bank'],
  ['mobile_wallet', 'Mobile wallet'],
  ['card', 'Card'],
  ['savings', 'Savings'],
] as const
type AccountType = (typeof TYPES)[number][0]
const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Banknote, bank: Landmark, mobile_wallet: Smartphone, card: CreditCard, savings: PiggyBank }

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
  const email = useUserEmail()
  const { theme = 'system', setTheme } = useTheme()
  const { data: issues } = useQuery<UploadIssue>(Q.uploadIssues)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const pref = (patch: Parameters<typeof saveProfile>[2]) => void saveProfile(db, userId, patch).catch((e) => toast(e instanceof Error ? e.message : 'Couldn’t save'))

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
    const { error } = await getSupabase().functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
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
          '﻿' +
            toCsv(
              cols,
              rows.map((r) => cols.map((c) => r[c] as string | number | null)),
            ),
        )
      }
      download(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `hisab-export-${new Date().toISOString().slice(0, 10)}.zip`)
      toast('Export downloaded')
    } catch {
      toast('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex max-w-4xl flex-col">
      <Section title="Profile" description="How Hisab greets you.">
        <Panel>
          <Row label="Your name" htmlFor="display-name" description={email ? `Signed in as ${email}` : undefined}>
            <Input
              id="display-name"
              key={displayName ?? ''}
              defaultValue={displayName ?? ''}
              placeholder="What should Hisab call you?"
              maxLength={80}
              className="sm:w-64"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (displayName ?? '')) pref({ display_name: v || null })
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </Row>
        </Panel>
      </Section>

      <Section title="Accounts" description="Cash, bank, wallets and cards. Open one to rename it, change its balance or archive it.">
        <ul className="rounded-card border border-border bg-surface p-1.5">
          {accounts.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? Wallet
            return (
              <li key={a.id}>
                <button
                  onClick={() => setEditing(a)}
                  className={cn('flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-surface-muted', a.archived && 'opacity-55')}
                >
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-surface-muted text-text-muted">
                    <Icon className="size-[18px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium" title={a.name}>
                      {a.name}
                    </span>
                    <span className="block text-[12.5px] text-text-faint">{a.archived ? 'Archived' : TYPES.find(([t]) => t === a.type)?.[1]}</span>
                  </span>
                  <Money minor={a.balance_minor} currency={currency} grouping={grouping} className="text-[14px] font-semibold" />
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-text-faint" />
                </button>
              </li>
            )
          })}
          <li className={cn(accounts.length > 0 && 'mt-1 border-t border-border-subtle pt-1')}>
            <button onClick={() => setEditing('new')} className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-[14px] font-medium transition-colors duration-150 hover:bg-surface-muted">
              <span aria-hidden className="grid size-9 place-items-center rounded-tile border border-dashed border-text-faint/40 text-text-muted">
                <Plus className="size-4" />
              </span>
              Add account
            </button>
          </li>
        </ul>
      </Section>

      <Section title="Money" description="Your home currency and how numbers are written.">
        <Panel>
          <Row label="Currency" description="Amounts show this ISO code." stack>
            <div className="flex flex-wrap gap-1.5">
              {['BDT', 'INR', 'PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR'].map((c) => (
                <Chip key={c} size="sm" selected={currency === c} onClick={() => pref({ base_currency: c })} className="min-w-14 justify-center">
                  {c}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label="Number style" description={grouping === 'south_asian' ? 'Lakh and crore grouping.' : 'Thousands grouping.'}>
            <Segmented
              label="Number style"
              value={grouping}
              onChange={(v) => pref({ number_grouping: v })}
              options={[
                { value: 'south_asian', label: <span className="num">2,48,350</span> },
                { value: 'western', label: <span className="num">248,350</span> },
              ]}
            />
          </Row>
          <Row label="Time zone" description={`Decides when “today” starts. Now: ${timeZone}`} stack>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([browserTz, 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'])].map((tz) => (
                <Chip key={tz} size="sm" selected={timeZone === tz} onClick={() => pref({ timezone: tz })} title={tz}>
                  {tz.split('/').pop()!.replace('_', ' ')}
                </Chip>
              ))}
            </div>
          </Row>
        </Panel>
      </Section>

      <Section title="Display" description="Privacy and appearance.">
        <Panel>
          <Row inline label="Hide amounts" htmlFor="hide-amounts" description="Masks every amount — or click the balance card. Synced to your phone.">
            <Switch id="hide-amounts" checked={hidden} onCheckedChange={toggle} />
          </Row>
          <Row label="Theme" description="System follows your device.">
            <Segmented
              label="Theme"
              value={theme as 'system' | 'light' | 'dark'}
              onChange={(t) => setTheme(t)}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
        </Panel>
      </Section>

      <Section title="Your data" description="Everything you’ve entered is yours to take.">
        <Panel>
          <Row label="Export everything" description="CSV files (one per table) in a ZIP, made in your browser.">
            <Button variant="outline" onClick={() => void exportAll()} disabled={exporting}>
              <Download /> {exporting ? 'Preparing…' : 'Export ZIP'}
            </Button>
          </Row>
          {issues.length > 0 && (
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-[14px] font-semibold">
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                    {issues.length} change{issues.length === 1 ? '' : 's'} couldn’t sync
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-text-muted">The server refused these changes, so they were undone. Re-enter any you still need — your other data is fine.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void clearIssues(db)}>
                  Dismiss all
                </Button>
              </div>
              <ul className="mt-3 divide-y divide-border-subtle rounded-[12px] border border-border-subtle">
                {issues.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate">{describeIssue(i)}</span>
                      <span className="block truncate text-[12px] text-text-faint" title={i.message}>
                        {i.message}
                      </span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => void discardIssue(db, i.id)}>
                      Dismiss
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </Section>

      <Section title="Session" description="Signing out keeps your data in this browser for next time.">
        <Panel>
          <Row label="Sign out" description="Anything not yet synced waits here for you.">
            <Button variant="outline" onClick={() => void signOut(false)} disabled={signingOut}>
              <LogOut /> Sign out
            </Button>
          </Row>
          <Row label="Sign out and remove data" description="For a shared computer: clears Hisab from this browser.">
            <Button variant="outline" onClick={() => void askWipe()} disabled={signingOut || wipeAsk !== null}>
              Remove & sign out
            </Button>
          </Row>
          {wipeAsk !== null && (
            <div className="px-5 py-4">
              <div role="alert" className={cn('rounded-[12px] border p-4', wipeAsk > 0 ? 'border-danger/30 bg-danger/[0.05]' : 'border-border bg-surface-muted/50')}>
                <p className={cn('text-[13.5px] leading-5', wipeAsk > 0 && 'text-danger')}>
                  {wipeAsk > 0
                    ? `${wipeAsk} ${wipeAsk === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet and will be lost. Stay online until they sync to keep ${wipeAsk === 1 ? 'it' : 'them'}.`
                    : 'Everything is synced. Remove Hisab’s data from this browser and sign out?'}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setWipeAsk(null)}>
                    Cancel
                  </Button>
                  <Button variant={wipeAsk > 0 ? 'danger' : 'primary'} onClick={() => void signOut(true)} disabled={signingOut}>
                    {wipeAsk > 0 ? 'Remove anyway' : 'Remove & sign out'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </Section>

      <Section title="Danger zone" description="Permanent. There’s no undo." danger>
        <div className="rounded-card border border-danger/30 bg-surface px-5 py-4">
          <p className="text-[14px] font-semibold text-danger">Delete my account</p>
          <p className="mt-0.5 text-[12.5px] leading-[18px] text-text-muted">Deletes your account and all your data, on every device. Type DELETE to confirm.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input aria-label="Type DELETE to confirm" placeholder="DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-40 tracking-wider" autoComplete="off" />
            <Button variant="danger" className="h-11" disabled={confirm !== 'DELETE' || deleting} onClick={() => void deleteAccount()}>
              {deleting ? 'Deleting…' : 'Delete forever'}
            </Button>
          </div>
        </div>
      </Section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === 'new' ? 'New account' : 'Edit account'} description={editing === 'new' ? 'Where you keep money: cash, a bank, a wallet or a card.' : undefined}>
            <AccountForm account={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

/** Settings section: title + description on the left (desktop), content on the right; stacked on phones. */
function Section({ title, description, children, danger }: { title: string; description?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className="grid gap-3 border-t border-border py-7 first:border-t-0 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:py-9">
      <div>
        <h2 className={cn('text-[15px] font-semibold tracking-[-0.01em]', danger && 'text-danger')}>{title}</h2>
        {description && <p className="mt-1 max-w-[40ch] text-[13px] leading-5 text-text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border-subtle rounded-card border border-border bg-surface">{children}</div>
}

/** One setting: label + help on the left, control on the right (or below it with `stack`). */
function Row({ label, description, children, stack, inline, htmlFor }: { label: string; description?: string; children: React.ReactNode; stack?: boolean; inline?: boolean; htmlFor?: string }) {
  return (
    <div
      className={cn(
        'flex gap-3 px-5 py-4',
        stack ? 'flex-col' : inline ? 'flex-row items-center justify-between gap-6' : 'flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6',
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-[14px] font-medium">
            {label}
          </label>
        ) : (
          <p className="text-[14px] font-medium">{label}</p>
        )}
        {description && <p className="mt-0.5 text-[12.5px] leading-[18px] text-text-faint">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
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
      <div role="group" aria-label="Account type" className="flex flex-wrap gap-1.5">
        {TYPES.map(([t, label]) => {
          const Icon = TYPE_ICON[t]
          return (
            <Chip key={t} size="sm" selected={type === t} onClick={() => setType(t)} icon={<Icon className="size-3.5" />}>
              {label}
            </Chip>
          )
        })}
      </div>
      <Field label="Name">
        <Input aria-label="Name" autoFocus placeholder="e.g. City Bank" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
      </Field>
      <Field
        label={`${account ? 'Opening balance' : 'Balance right now'} (${currency})`}
        hint={
          account ? (
            <>
              Balance now: <Money minor={account.balance_minor} currency={currency} grouping={grouping} />
            </>
          ) : undefined
        }
      >
        <Input aria-label="Balance" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} className="num" />
      </Field>
      {type === 'card' && (
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-border px-3.5 py-3">
          <label htmlFor="card-owed" className="text-[13.5px]">
            This is money I owe <span className="text-text-faint">(credit card)</span>
          </label>
          <Switch id="card-owed" checked={owed} onCheckedChange={setOwed} />
        </div>
      )}
      <p role="alert" className={cn('-my-1 min-h-5 text-[13px] text-danger', !error && 'invisible')}>
        {error ?? ' '}
      </p>
      <div className="flex gap-2">
        {account && (
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              await archiveAccount(db, account.id, !account.archived)
              toast(account.archived ? 'Account restored' : 'Account archived', {
                action: { label: 'Undo', onClick: () => void archiveAccount(db, account.id, Boolean(account.archived)) },
              })
              onDone()
            }}
          >
            {account.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          {account ? 'Save changes' : 'Add account'}
        </Button>
      </div>
    </form>
  )
}
