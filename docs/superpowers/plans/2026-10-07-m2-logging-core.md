# Hisab M2 — Logging Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can log daily money on the phone in about 3 seconds (online or offline), see real balances, and review everything in Activity. The web shows the same live balance.

**Architecture:** Pure domain math lives in `packages/core`. SQL queries and mutations live in `packages/db`, behind a minimal `Executor` interface (`execute`/`getAll`/`get`), so they are tested against real SQLite (`node:sqlite`) in Vitest. They run on PowerSync in the apps. The mobile UI is built from small token-driven primitives; the quick-log flow is a `@gorhom/bottom-sheet`.

**Tech Stack:** As M1, plus `@gorhom/bottom-sheet` 5 and `node:sqlite` (tests only).

**Spec:** `docs/superpowers/specs/2026-10-06-hisab-design.md` (§5.2 types/effects, §6.1–6.2, §6.7, §7.3 Home/Quick-log/Activity, §9)

## Global Constraints
- Money is an integer number of minor units. Display uses ISO codes, e.g. `BDT 2,48,350`. South Asian grouping is the default.
- Balance effect: `income` and `lending_in` add; `expense`, `emi` and `lending_out` subtract; a `transfer` subtracts from `account_id` and adds to `to_account_id`.
- "Spending" = `expense` only; "Income" = `income` only. Transfers are excluded from both.
- Soft delete only (`deleted_at`). Every query filters `deleted_at is null`.
- Dates: `occurred_on` is the local `YYYY-MM-DD` in the profile timezone (default `Asia/Dhaka`); `occurred_at` is a UTC ISO string.
- Undo window is 5 s (`tokens.motion.undoMs`). There are no confirmation dialogs for deletes.
- Every write passes zod validation before it reaches the local database.

## Review Focus
1. **Editing a transaction's type** (e.g. expense → transfer) must clear the fields that no longer apply (`category_id`), or Postgres rejects the upload. Tested in Task 3 (`updateTransaction` nulls irrelevant columns).
2. **Logging just after midnight local time while UTC is still the previous day** must group under the local day. Tested in Task 1 (`localDate` with `Asia/Dhaka`).
3. **Amount entry edge cases on the keypad** (leading zeros, a second decimal point, a third decimal digit, backspace to empty) behave like a calculator. Tested in Task 2 (`keypadReducer`).
4. **Archived accounts** keep their history in Activity but disappear from the account pickers and the total. Tested in Task 3 (queries).
5. **Undo after the row has already uploaded** restores it (`deleted_at = null` PATCH). Tested in Task 3 (`restoreTransaction`).

---

### Task 1: core — balances, dates, grouping, suggestions
**Files:** `packages/core/src/{ledger.ts,dates.ts,suggest.ts}` and tests.
**Produces:**
- `signedEffect(tx: {type, amount_minor, account_id, to_account_id?}, accountId: string): number`
- `localDate(at: Date, timeZone: string): string` returns `YYYY-MM-DD`
- `groupByDay<T extends {occurred_on: string}>(rows: T[]): {day: string; rows: T[]}[]`, newest first
- `dayLabel(day: string, today: string): string` returns 'Today' | 'Yesterday' | 'Mon, 5 Oct' | '5 Oct 2025' (different year)
- `monthRange(day: string): {start: string; end: string}`
- `rankSuggestions(history: SuggestionRow[], now: Date, timeZone): Suggestion[]` (top 3, spec §6.7) and `rankCategories(history, now, tz, all: {id}[]): string[]` (top 4 ids)

Tests: signed effects for all 6 types, both transfer sides, and an unrelated account (0). `localDate` at `2026-10-06T18:30Z` in Asia/Dhaka gives `2026-10-07`. `groupByDay` ordering. `dayLabel` variants. Suggestion scoring: frequency × recency × hour proximity, ties are deterministic, entries older than 60 days are excluded, duplicates are merged by (category, amount, note).

### Task 2: core — keypad amount entry
**Files:** `packages/core/src/keypad.ts` and test.
**Produces:** `keypadReducer(state: string, key: '0'..'9' | '.' | 'back' | 'clear'): string` and `keypadToMinor(state): number | null`.
Rules: max 2 decimal digits; a single '.'; a leading '.' becomes '0.'; leading zeros collapse ('00' → '0', '05' → '5'); max 10 integer digits; backspace past the start gives ''.

### Task 3: db — executor, queries, mutations (tested on node:sqlite)
**Files:** `packages/db/src/{executor.ts,queries.ts,mutations.ts}`, `packages/db/test/sqlite.ts` (creates the AppSchema tables in node:sqlite as plain tables), and tests.
**Produces:**
- `interface Executor { execute(sql, params?): Promise<unknown>; getAll<T>(sql, params?): Promise<T[]>; getOptional<T>(sql, params?): Promise<T | null> }`. PowerSync's db satisfies it structurally.
- SQL constants and builders: `Q.accountsWithBalance` (non-deleted; includes archived plus an `archived` flag; balance = opening + signed sums), `Q.totalBalance` (non-archived), `Q.categories(kind)`, `Q.parties`, `Q.transactionsBetween(start, end)` (joins category/account/party names for display), `Q.todayTransactions(day)`, `Q.monthSummary(start, end)` → `{income, expense}`, `Q.suggestionHistory(sinceDay)`, `Q.balanceSeries(days)` (end-of-day totals for a 30-day trend).
- Mutations, each validating with zod and returning an id:
  - `createTransaction(ex, userId, input)`
  - `updateTransaction(ex, id, input)`: full replace; nulls fields that aren't relevant to the type
  - `softDeleteTransaction(ex, id)` and `restoreTransaction(ex, id)`
  - `createAccount`, `updateAccount`, `archiveAccount`
  - `createParty`
- Tests: balance math across types (including transfers between two accounts and an archived account excluded from the total); a soft-deleted transaction disappears and comes back on restore; update from expense → transfer clears `category_id`; month summary excludes transfers; invalid input throws `ValidationError` carrying zod issues.

### Task 4: mobile — UI primitives and app data hooks
**Files:** `apps/mobile/src/components/{sheet.tsx,chip.tsx,segmented.tsx,list.tsx,toast.tsx,keypad.tsx,amount-display.tsx}`, `apps/mobile/src/lib/{data.ts,profile.ts,undo.tsx}`.
- `useProfile()` returns base currency, grouping, timezone and userId (from the `profiles` row, with defaults when it's absent offline).
- `useUndo()`: a toast with an Undo action, shown for 5 s.
- Verification: `tsc` and an `expo export` bundle.

### Task 5: mobile — Accounts (Settings → Accounts, add/edit/archive)
Settings screen opened from the Home avatar. Account list with balances; a form sheet (name, type chips, opening balance via the keypad). Home empty state: "Add your first account".

### Task 6: mobile — Quick-log sheet
The + button opens the sheet:
- Type segment: Expense · Income · Transfer. Lend arrives in M4.
- "Suggested now" chips; one tap logs.
- Amount display and keypad.
- Category chips (top 4 + "More" picker).
- Meta chips: account (the last used for that category), date (Today / Yesterday / pick), note.
- Income: optional party plus "Received in another currency" (original amount, currency, rate; the BDT amount is computed with `convertFx`).
- Transfer: from/to account chips.
- Save: haptic, close, undo toast. Validation errors appear inline in the sheet.
- Editing an existing transaction reuses the sheet.

### Task 7: mobile — Home and Activity
- **Home:** live hero (total balance, 30-day trend line) and a Today list with the day's total. Rows open the edit sheet.
- **Activity:**
  - Month switcher and In/Out/Net summary card.
  - Day-grouped sections with daily totals.
  - Swipe left to delete, with undo. Transfers are shown in grey.
- **Web Home:** shows the live total balance (same `Q.totalBalance`).

### Task 8: verification and docs
Run `turbo typecheck test`, both `expo export` bundles and the web build. Add a Playwright smoke test for the web live balance using a temp user (deleted afterwards). Ledger.
