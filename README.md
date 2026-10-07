# Hisab

A personal finance app you'll actually keep up with. Log a payment in about 3 seconds, see how much you
have and what's due, track how many EMI months are left, and get reminded when someone owes you money.

- **Android app:** Expo, with a quick-log sheet, Home / Activity / Plan / People, reminders and app lock.
- **Web app:** Next.js. A month-end review dashboard, an Activity table, reports and CSV/PDF export, `N` to log and ⌘K for the command bar.
- **Offline-first:** everything reads and writes a local SQLite database, and PowerSync syncs it with Supabase.

Design docs:
- Spec: `docs/superpowers/specs/2026-10-06-hisab-design.md`
- Plans (M1–M6): `docs/superpowers/plans/`

## Features
- **Accounts:** cash, bank, mobile wallet, card and savings, with transfers between them. Balances are always calculated from your history, never stored.
- **Quick log:** expense, income, transfer or lend. Includes one-tap suggestions, a number pad, smart defaults, undo, and foreign-currency income at the rate you actually got.
- **Recurring items:** salary, rent and so on, in two modes — "confirm" items show in **Due soon** for a one-tap ✓, while "auto" items post themselves.
- **EMI loans:** months left, amount left, debt-free date, and one-tap Mark paid.
- **Lending, both directions:** partial repayments, WhatsApp or SMS reminders with a pre-filled message, and the full history per person.
- **Budgets:** monthly, overall or per category, with "safe to spend per day" and 80%/100% alerts.
- **Notifications (Android, local):** EMI due, money owed, recurring items, and a daily "anything to log?" nudge.
- **Monthly report:** income by source, spending by category, EMIs and money with people. Export as CSV, print to PDF, or download all data as a ZIP.
- **Privacy:** hide amounts, biometric app lock, per-user local database, and account deletion.

## Structure
| Path | What |
|---|---|
| `apps/mobile` | Expo SDK 57 (Expo Router, NativeWind 4) — Android |
| `apps/web` | Next.js 16 (App Router, Tailwind v4) |
| `packages/core` | Pure TypeScript domain logic: money, dates, EMI, recurrence, lending, budgets, notification planner, reports |
| `packages/db` | PowerSync schema, validators, shared queries and mutations (tested on SQLite), upload connector |
| `packages/tokens` | Design tokens shared by both apps (AA contrast tested) |
| `supabase/` | Migrations (RLS, constraints, signup seed), DB tests, the `delete-account` Edge Function, email template |
| `powersync/` | Sync rules + setup guide |

## One-time setup

### 1. Email sign-in code (required)
The apps sign in with a 6-digit code sent by email. Supabase's default email template only contains a link,
so you need to change it once in the Supabase dashboard:
1. Go to **Authentication → Emails → Templates**. Edit both **Magic Link** and **Confirm signup**:
   - Subject: `Your Hisab code: {{ .Token }}`
   - Body: the contents of `supabase/templates/otp.html`
2. Go to **Authentication → Sign In / Providers → Email** and set **Email OTP length** to `6`.

Until you do this, the web app still works: clicking the link in the email signs you in through `/auth/callback`.

### 2. Sync across devices (optional — the apps work on one device without it)
Follow `powersync/README.md` to create a free PowerSync Cloud instance and deploy `powersync/sync-rules.yaml`
(it uses `edition: 2`). Then set `NEXT_PUBLIC_POWERSYNC_URL` and `EXPO_PUBLIC_POWERSYNC_URL`.

### 3. Environment
```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local     # Supabase URL + publishable key (+ PowerSync URL)
cp apps/mobile/.env.example apps/mobile/.env
```

## Run
```bash
pnpm --filter @hisab/web dev              # http://localhost:3000
```

**Android (beta APK — no Play Store or developer account needed):**
```bash
cd apps/mobile
npx eas-cli@latest login                  # free Expo account
npx eas-cli@latest build --profile preview --platform android
```
Open the link EAS gives you on your phone and install the APK. For day-to-day development, use
`--profile development` once, then run `pnpm --filter @hisab/mobile start`.
(op-sqlite is a native module, so the app needs a real build and won't run in Expo Go.)

## Test
```bash
pnpm turbo run typecheck test                          # 374 unit tests across core / db / tokens / mobile
DATABASE_URL=postgresql://... ./scripts/db-test.sh     # 45 database tests (RLS, constraints); rolls back
E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e/web-smoke.mjs http://localhost:3100 ./out   # Playwright smoke
```
