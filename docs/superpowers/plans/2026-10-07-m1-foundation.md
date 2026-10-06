# Hisab M1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working monorepo that contains the full Postgres schema (with RLS and constraints), the shared token, domain and data packages, and web and mobile app shells. Both shells sign in with Supabase and read and write through PowerSync local SQLite.

**Architecture:** Turborepo + pnpm workspaces. `packages/core` (pure TS domain logic), `packages/tokens` (design tokens), `packages/db` (PowerSync schema, zod validators, typed queries) are shared by `apps/web` (Next.js 16) and `apps/mobile` (Expo SDK 57). Supabase is the source of truth. PowerSync syncs a per-user bucket to on-device and in-browser SQLite.

**Tech Stack:** pnpm 11, Turbo 2.11, TypeScript 5.x, Vitest 5, Next.js 16.4 + Tailwind v4 + shadcn/ui, Expo 57 + Expo Router + NativeWind 4.2 (Tailwind 3.4), Supabase CLI 2.106 (local Postgres via Docker), PowerSync (`@powersync/web` 2.4, `@powersync/react-native` 2.3, `@powersync/react` 2.0), zod 4.

**Spec:** `docs/superpowers/specs/2026-10-06-hisab-design.md`

## Global Constraints
- Money is always an integer of minor units (`amount_minor`); floats are never used for money.
- The ISO currency code is shown instead of a symbol, e.g. `BDT 2,48,350`. The code is rendered at 0.62em, weight 500, 45% opacity.
- South Asian number grouping is the default; `western` is a setting.
- Every user-data table has `id uuid` (client-generated UUIDv7), `user_id`, `created_at`, `updated_at`, `deleted_at`.
- RLS on every table: `user_id = auth.uid()`.
- No service-role key in any client bundle.
- Both apps consume colors, radii, spacing and type from `packages/tokens` only.
- Light theme: page `#F5F5F3`, surface `#FFFFFF`, border `#EAEAE5`, text `#141414`. Dark theme: page `#0C0C0D`, surface `#161718`, border `#232427`, text `#EDEDEC`.
- Windows dev machine: scripts must run in Git Bash and PowerShell (no POSIX-only shell tricks in package.json scripts).

## Review Focus
1. **Cross-user data access.** User B must not be able to select, insert, update or soft-delete user A's rows, and must not be able to point a foreign key at A's account. A pgTAP test covers this in Task 3.
2. **Malformed transaction shapes** (a transfer without `to_account_id`, an expense without a category, a zero or negative amount) must be rejected by Postgres even if a client bypasses zod. CHECK-constraint tests are in Task 3.
3. **A second recurring post for the same rule and date** from a second device must be rejected by the unique index. Covered in Task 3.
4. **A sign-in OTP typo or expired code** must show an inline error and keep the entered email. Covered by a unit test of the auth form state in Tasks 6 and 7.
5. **First launch with no network:** the shell must still render from local SQLite (no blocking spinner), with the sync indicator showing "Offline". The status mapping is unit-tested in Task 5.

---

## File Structure

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .npmrc, .prettierrc
packages/tokens/   src/index.ts (tokens), src/css.ts (CSS var generator), test/
packages/core/     src/money.ts, src/index.ts, test/money.test.ts
packages/db/       src/schema.ts (PowerSync AppSchema), src/validators.ts (zod),
                   src/sync-status.ts, src/ids.ts, src/connector.ts (Supabase upload connector), test/
supabase/          config.toml, migrations/0001_schema.sql, 0002_rls.sql, 0003_seed_fn.sql,
                   0004_powersync_publication.sql, tests/*.sql (pgTAP)
powersync/         sync-rules.yaml, docker-compose.yml, powersync.yaml (self-host dev config)
apps/web/          Next.js app: app/(auth)/sign-in, app/(app)/layout with sidebar, lib/supabase, lib/powersync
apps/mobile/       Expo Router app: app/(auth)/sign-in, app/(tabs)/{index,activity,plan,people}, lib/
```

---

### Task 1: Monorepo scaffold

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.npmrc`, `.prettierrc`.

- [ ] Step 1: Root `package.json` with `"private": true`, `packageManager: "pnpm@11.24.0"`, and scripts `build`, `dev`, `test`, `typecheck`, `lint` delegating to `turbo run <x>`. Dev dependencies: `turbo`, `typescript`, `prettier`, `vitest`.
- [ ] Step 2: `pnpm-workspace.yaml` listing `apps/*` and `packages/*`. Add `.npmrc` with `node-linker=hoisted` (Expo/Metro require hoisting).
- [ ] Step 3: `turbo.json` defining tasks `build` (dependsOn `^build`, outputs `dist/**`, `.next/**`), `test`, `typecheck` (dependsOn `^build`), and `dev` (persistent, no cache).
- [ ] Step 4: `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, `moduleResolution: "Bundler"`, `target: ES2022`, `jsx: react-jsx`.
- [ ] Step 5: Run `pnpm install`. Expected: success with no workspace packages yet.
- [ ] Step 6: Commit `chore: monorepo scaffold`.

### Task 2: `packages/tokens` and `packages/core` money

**Interfaces produced:**
- `tokens`: `{ color: { light: ThemeColors, dark: ThemeColors }, radius, space, font, motion }`, where `ThemeColors` has the keys `page surface surfaceMuted border text textMuted brand brandFg positive warning danger heroFrom heroTo`.
- `cssVariables(theme: 'light'|'dark'): Record<string,string>` maps each color to `--<kebab-key>`.
- `core`: `parseAmount(input: string): { ok: true; minor: number } | { ok: false; error: 'empty'|'invalid'|'zero'|'negative'|'precision' }`
- `formatMoney(minor: number, currency: string, opts?: { grouping?: 'south_asian'|'western'; showDecimals?: 'always'|'never'|'auto'; sign?: 'auto'|'always'|'never' }): { code: string; number: string; text: string }`
- `formatCompact(minor: number, grouping): string` gives `4.2L`, `1.2Cr`, `420K`, `1.2M`, or the plain grouped number below 1 lakh/1K.
- `convertFx(originalMinor: number, rate: string): number` multiplies with half-even rounding using string-decimal math (no float error).

- [ ] Step 1: Write failing tests `packages/core/test/money.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseAmount, formatMoney, formatCompact, convertFx } from '../src/money'
describe('parseAmount', () => {
  it.each([['1450', 145000], ['1,450', 145000], ['1450.5', 145050], ['0.75', 75], [' 12 ', 1200], ['2,48,350.00', 24835000]])('%s', (i, m) => expect(parseAmount(i)).toEqual({ ok: true, minor: m }))
  it.each([['', 'empty'], ['abc', 'invalid'], ['0', 'zero'], ['-5', 'negative'], ['1.234', 'precision'], ['1..2', 'invalid']])('%s → %s', (i, e) => expect(parseAmount(i)).toEqual({ ok: false, error: e }))
})
describe('formatMoney', () => {
  it('south asian grouping', () => expect(formatMoney(24835000, 'BDT').text).toBe('BDT 2,48,350'))
  it('western grouping', () => expect(formatMoney(24835000, 'BDT', { grouping: 'western' }).text).toBe('BDT 248,350'))
  it('crore', () => expect(formatMoney(1234567800, 'BDT').number).toBe('1,23,45,678'))
  it('auto decimals', () => expect(formatMoney(125050, 'USD').number).toBe('1,250.50'))
  it('always decimals', () => expect(formatMoney(100, 'BDT', { showDecimals: 'always' }).number).toBe('1.00'))
  it('negative sign', () => expect(formatMoney(-3000, 'BDT').text).toBe('BDT −30'))
  it('always sign', () => expect(formatMoney(3000, 'BDT', { sign: 'always' }).number).toBe('+30'))
})
describe('formatCompact', () => {
  it.each([[42000000, 'south_asian', '4.2L'], [12000000000, 'south_asian', '1.2Cr'], [42000000, 'western', '420K'], [120000000, 'western', '1.2M'], [3500000, 'south_asian', '35,000'], [99900, 'western', '999']])('%d %s', (m, g, out) => expect(formatCompact(m, g as any)).toBe(out))
})
describe('convertFx', () => {
  it('converts', () => expect(convertFx(50000, '121.4')).toBe(6070000))
  it('half-even', () => expect(convertFx(1, '0.5')).toBe(0))
  it('half-even up', () => expect(convertFx(3, '0.5')).toBe(2))
})
```
- [ ] Step 2: Run `pnpm --filter @hisab/core test`. Expected: FAIL (module missing).
- [ ] Step 3: Implement `money.ts` with BigInt-based decimal math for `convertFx` and manual grouping (Intl is not used, so output is the same on Hermes and Node).
- [ ] Step 4: Tokens: write `tokens/test/tokens.test.ts` asserting that both themes share identical key sets, the brand color equals the text color, and `cssVariables('light')['--page'] === '#F5F5F3'`. Then implement.
- [ ] Step 5: Run the tests. Expected: PASS. Commit `feat: tokens and money formatting`.

### Task 3: Supabase schema, RLS, constraints, pgTAP

**Files:** `supabase/config.toml` (via `supabase init`), `supabase/migrations/*.sql`, `supabase/tests/*.sql`.

The schema follows spec §5.2 exactly (all tables: profiles, accounts, categories, parties, transactions, recurring_rules, recurring_skips, loans, lendings, lending_reminders_sent, budgets). Enums are implemented as `text` + `CHECK` (simpler with PowerSync). Every table has an `updated_at` trigger.

Key constraints (spec §5.3):
```sql
-- transactions shape
check (amount_minor > 0),
check (type in ('expense','income','transfer','emi','lending_out','lending_in')),
check ((type = 'transfer') = (to_account_id is not null)),
check (to_account_id is null or to_account_id <> account_id),
check ((type in ('expense','income')) = (category_id is not null)),
check ((type = 'emi') = (loan_id is not null and installment_number is not null)),
check ((type in ('lending_out','lending_in')) = (lending_id is not null)),
check ((original_amount_minor is null) = (original_currency is null) and (original_currency is null) = (fx_rate is null)),
check ((recurring_rule_id is null) = (occurrence_date is null))
create unique index tx_recurring_once on transactions(recurring_rule_id, occurrence_date) where deleted_at is null and recurring_rule_id is not null;
create unique index tx_installment_once on transactions(loan_id, installment_number) where deleted_at is null and loan_id is not null;
```
Cross-user FK protection: a `BEFORE INSERT OR UPDATE` trigger `assert_same_owner()` on tables with references checks that every referenced row has the same `user_id` and raises `foreign key owner mismatch` otherwise.

New-user trigger on `auth.users` insert: create the `profiles` row and seed default categories (spec §5.2 list) via `seed_default_categories(uid)`.

PowerSync: `create publication powersync for table <all user tables>`.

- [ ] Step 1: `supabase init`, then write the pgTAP tests first: `tests/rls.test.sql` (two users; B cannot see, update or insert-as A; B cannot reference A's account), `tests/constraints.test.sql` (each CHECK above rejects bad rows; the unique recurring and installment indexes reject duplicates; soft-deleted rows don't block a re-insert), `tests/signup.test.sql` (inserting into auth.users creates a profile and 18 categories).
- [ ] Step 2: `supabase start -x studio,imgproxy,vector,logflare,edge-runtime,supavisor` then `supabase test db`. Expected: FAIL.
- [ ] Step 3: Write the migrations.
- [ ] Step 4: `supabase db reset && supabase test db`. Expected: all PASS.
- [ ] Step 5: Commit `feat(db): schema, rls, constraints with pgTAP tests`.

### Task 4: PowerSync sync rules and dev service

**Files:** `powersync/sync-rules.yaml`, `powersync/powersync.yaml`, `powersync/docker-compose.yml`, `README.md` section "Local dev".

```yaml
bucket_definitions:
  user_data:
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM profiles WHERE id = bucket.user_id
      - SELECT * FROM accounts WHERE user_id = bucket.user_id
      # … one line per user table
```
The service connects to the local Supabase Postgres (`host.docker.internal:54322`) and verifies Supabase JWTs with the local JWT secret.

- [ ] Step 1: Write the configs. Run `docker compose -f powersync/docker-compose.yml up -d`. Expected: the service is healthy at `http://localhost:8080/probes/liveness`. If machine memory prevents it, record that in the README and continue; the apps fall back to local-only mode when `POWERSYNC_URL` is unset.
- [ ] Step 2: Commit `feat(sync): powersync sync rules and dev service`.

### Task 5: `packages/db`

**Interfaces produced:**
- `AppSchema` (PowerSync `Schema`) with one `Table` per Postgres table. Columns are `column.text` / `column.integer` (bools as 0/1). `id` is implicit.
- `newId(): string` (UUIDv7).
- `SupabaseConnector implements PowerSyncBackendConnector` with constructor `(supabase: SupabaseClient, opts: { powersyncUrl?: string })`, `fetchCredentials()` and `uploadData(db)`. `uploadData` maps PUT→upsert, PATCH→update, DELETE→delete. A 4xx PostgREST error code (class `22`, `23`, `42`) marks the op as a permanent failure: it is logged to the local `upload_issues` local-only table and the transaction is completed. Other errors throw so PowerSync retries.
- `syncStatusLabel(s: { connected: boolean; uploading: boolean; downloading: boolean; hasSynced?: boolean; pendingCount: number; issueCount: number }): { kind: 'ok'|'syncing'|'offline'|'issues'; label: string }`.
- zod validators: `transactionInput`, `accountInput`, `partyInput`, which mirror the Postgres CHECKs.

- [ ] Step 1: Failing tests: `sync-status.test.ts` (offline with 3 pending gives `Offline · 3 pending`; 2 issues give `2 issues` with priority over syncing; connected and idle gives `Up to date`), `validators.test.ts` (each invalid transaction shape from Task 3 is rejected with a field path; valid shapes pass), `connector.test.ts` (a mocked supabase client routes PUT/PATCH/DELETE correctly; a `23514` error records an issue and completes the op; a network error rethrows).
- [ ] Step 2: Implement. Step 3: Tests PASS. Commit `feat(db): powersync schema, validators, connector`.

### Task 6: Web app shell (Next.js 16)

**Files:** `apps/web` created with `create-next-app` (TS, App Router, Tailwind v4, src-less), then shadcn init.
- `app/globals.css`: Tailwind v4 `@theme` mapped to the CSS variables generated from `@hisab/tokens` (a `scripts/gen-tokens.mjs` writes `app/tokens.css`; run in `predev`/`prebuild`).
- `lib/supabase/{client,server,middleware}.ts` (`@supabase/ssr`).
- `middleware.ts`: redirect unauthenticated users to `/sign-in`.
- `app/(auth)/sign-in/page.tsx`: email → 6-digit OTP, two steps, inline errors, email kept on error.
- `lib/powersync/provider.tsx`: client-only `PowerSyncDatabase` (web, `dbFilename: 'hisab.db'`) + `SupabaseConnector`, wrapped in `PowerSyncContext.Provider`.
- `app/(app)/layout.tsx`: sidebar (Home, Activity, Plan, People, Reports, Settings), main area, a sync-status pill in the header, and a theme toggle (`next-themes`).
- `app/(app)/page.tsx`: Home placeholder with an ink hero card rendering `formatMoney(0,'BDT')`.
- `lib/auth-form.ts`: pure reducer for the OTP form (tested).

- [ ] Step 1: Failing test `lib/auth-form.test.ts`: typing email → `request`; a send error keeps the email and sets the error; a verify error keeps the code step and sets the error; success → `done`.
- [ ] Step 2: Scaffold and implement.
- [ ] Step 3: `pnpm --filter web test && pnpm --filter web build`. Expected: PASS and a successful build.
- [ ] Step 4: Run `pnpm --filter web dev`, then load `/sign-in` with Playwright and screenshot it. Expected: renders in both themes.
- [ ] Step 5: Commit `feat(web): app shell, auth, powersync provider`.

### Task 7: Mobile app shell (Expo 57)

**Files:** `apps/mobile` from `create-expo-app --template blank-typescript`, then Expo Router.
- NativeWind 4.2 + `tailwindcss@3.4`; `tailwind.config.js` reads colors from `@hisab/tokens` via CSS variables (`vars()` in the root layout for light and dark).
- `lib/supabase.ts`: Supabase client with `expo-secure-store`-backed storage (chunked for values over 2KB).
- `lib/powersync.ts`: `PowerSyncDatabase` with the `@powersync/op-sqlite` adapter + `SupabaseConnector`.
- `app/_layout.tsx`: providers (gesture handler, safe area, theme, PowerSync), auth gate.
- `app/(auth)/sign-in.tsx`: the same OTP flow using the shared `auth-form` reducer (moved to `packages/core/src/auth-form.ts` so both apps share it).
- `app/(tabs)/_layout.tsx`: four tabs (Home · Activity · Plan · People) with the active tint set to the brand color, plus a floating + placeholder.
- `app/(tabs)/index.tsx`: Home with the ink hero card.

- [ ] Step 1: Move the `auth-form` reducer and its test into core (the tests keep passing).
- [ ] Step 2: Scaffold and implement.
- [ ] Step 3: `pnpm --filter mobile typecheck` and `npx expo export --platform android` / `--platform ios`. Expected: bundles build (this verifies the Metro + NativeWind + PowerSync config).
- [ ] Step 4: Commit `feat(mobile): app shell, auth, powersync`.

### Task 8: CI and docs
- [ ] `.github/workflows/ci.yml`: pnpm install, `turbo run typecheck test`, a Supabase job running `supabase db start && supabase test db`.
- [ ] `README.md`: prerequisites, `.env.example` for both apps (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_POWERSYNC_URL`, `EXPO_PUBLIC_*` equivalents), and the local dev steps.
- [ ] Commit `chore: ci and docs`.
