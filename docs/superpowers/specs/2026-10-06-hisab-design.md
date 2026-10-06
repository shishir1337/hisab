# Hisab — Personal Finance Tracker: Design Spec

- **Date:** 2026-10-06
- **Status:** Approved in brainstorming, pending written-spec review
- **Platforms:** Mobile (iOS + Android, Expo / React Native) and Web (Next.js)

---

## 1. Purpose and success criteria

### Problem
The owner spends money daily without recording it, and reconstructing the month at month-end is painful. Money comes in from several sources (salaries from multiple companies, project payments) and goes out to daily spending, monthly loan EMIs and one-off costs. Money lent to people is forgotten and never followed up.

### Intended outcome
A record that is **actually kept up** because logging is effortless, giving at any moment:
- how much money there is right now, per account and in total;
- where money went this month;
- how many EMI months, and how much money, are left on each loan;
- who owes money (and to whom money is owed), with a nudge to follow up.

### Success criteria
1. A typical expense is logged in **≤ 3 seconds / ≤ 3 taps** from opening the app, online or offline.
2. A logged entry is **never lost** (offline, crash, or sync failure).
3. At month-end the owner can see income vs. expense, top categories and EMIs paid **without any reconstruction work**.
4. No lending stays forgotten: overdue lendings produce repeat reminders until they are settled.
5. The UI reads as premium and minimal: calm, consistent, polished in both light and dark themes.

### Audience
Built for the owner first, but architected for many users from day one (accounts, strict per-user data isolation, data export and account deletion). Billing, marketing and growth features are **out of scope** for v1.

---

## 2. Scope

### In v1
- Accounts and wallets (cash, bank, mobile wallet, card, savings) with transfers between them
- Income and expense logging with categories and parties (people and companies)
- Quick-log bottom sheet with smart suggestions
- Recurring items (salaries, rent, subscriptions) in "confirm" or "auto" mode
- Fixed-EMI loans with months left, amount left, next due date and "debt-free by" date
- Lending in both directions (**lent** and **borrowed**) with partial repayments, reminders, and one-tap WhatsApp/SMS messages
- Monthly budgets per category plus an optional overall monthly budget, with "safe to spend per day"
- Daily log nudge
- Monthly report, plus CSV export (transactions) and PDF export (report)
- Foreign-currency income recorded at the actual conversion rate
- Light and dark themes, optional biometric app lock, "hide amounts"
- Export all data and delete account

### Explicitly out of v1
Bank or SMS-parsing integrations · accounts held in a foreign currency · live exchange rates · amortization schedules or interest breakdown · receipt photos · web push notifications · home-screen widget (planned for v1.1) · shared or household budgets · billing and subscriptions · investments or net-worth assets.

---

## 3. Product decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Audience | Owner first, multi-user-ready architecture |
| Offline | **Must work offline**: local-first, background sync |
| Currency | One base currency per user (default BDT). Foreign income is converted at the time of entry, and the original amount, currency and rate are stored |
| Accounts | Per-account balances; transfers are not spending |
| Loans | Fixed monthly EMI (interest is included in the EMI) |
| Lending reminders | Push notification to the owner, plus a one-tap pre-filled WhatsApp/SMS message. **Never auto-sent** |
| Lending directions | Lent **and** borrowed |
| Visual direction | "C1 + C2": light page, dark "ink" hero card, ink-black brand color, color used only where it means something. Light and dark themes |
| Currency display | **ISO code instead of symbol**: `BDT 2,48,350`, `USD 500`. The code is rendered smaller and lighter than the number |
| Number grouping | South Asian grouping by default (`2,48,350`); Western grouping (`248,350`) available as a setting |

---

## 4. Architecture

### 4.1 Chosen approach: local-first with Supabase + PowerSync
- **Supabase** provides Postgres (the source of truth), Auth, and row-level security.
- **PowerSync** syncs each user's rows into an **on-device SQLite** database (mobile) or in-browser SQLite (web, wa-sqlite on OPFS/IndexedDB). All reads and writes hit the local database; uploads go through a queue in the background.
- **Why:** PowerSync is the only mainstream sync engine with first-class offline support and a mature React Native SDK, and real Postgres keeps finance queries (aggregates, grouping, reports) straightforward. Alternatives that were considered and rejected: a hand-written sync (high risk of hard sync bugs), and InstantDB or Convex (weaker offline guarantees, awkward relational reporting, more vendor lock-in).

### 4.2 Data flow
```
UI ──► packages/db queries ──► local SQLite (PowerSync) ──► instant UI update (reactive queries)
                                     │
                                     └─► upload queue ──► Supabase REST (user JWT) ──► Postgres
                                                                                   (RLS + CHECK constraints)
Postgres ──► PowerSync service (sync rules: bucket per user_id) ──► local SQLite on every device
```
- The upload connector applies each queued CRUD operation through the Supabase client using the user's session. A write rejected by the server for validation reasons (4xx) is discarded and surfaced in an "unsynced issues" view under Settings rather than retried forever. Network or 5xx failures retry with exponential backoff.
- **Conflict policy:** last write wins per row. This is acceptable because the data is mostly appended, and concurrent edits only happen when one person uses two devices.

### 4.3 Monorepo layout (Turborepo + pnpm)
```
apps/web          Next.js 16 (App Router), shadcn/ui, Tailwind v4, Recharts (shadcn charts),
                  PowerSync web SDK
apps/mobile       Expo (latest SDK), Expo Router, NativeWind, react-native-reusables,
                  Reanimated, @gorhom/bottom-sheet, expo-haptics, expo-notifications,
                  expo-local-authentication, expo-secure-store, expo-quick-actions, expo-print
packages/core     Pure TypeScript, no UI and no I/O: money parsing and formatting, EMI progress,
                  recurrence dates, balances, lending status, budget math, suggestion ranking,
                  notification planning
packages/db       Drizzle schema + PowerSync schema, typed shared queries, zod validators
packages/tokens   Design tokens (color, radius, spacing, typography, motion) consumed by
                  both Tailwind configs
supabase/         SQL migrations, RLS policies, CHECK and UNIQUE constraints, PowerSync sync
                  rules, default-category seed, pgTAP tests
```
**Boundary rule:** anything that computes a number shown to the user lives in `packages/core` and is shared by both apps. The apps only render.

---

## 5. Data model

### 5.1 Conventions
- **IDs:** UUIDv7 generated on the client, so rows can be created offline and sort by time.
- **Every table has** `user_id` (default `auth.uid()`), `created_at`, `updated_at`, and `deleted_at` (soft delete, which syncs cleanly and allows undo).
- **Money:** `BIGINT` minor units (BDT and USD have 2 decimal places, so `1,250.50` is stored as `125050`). Floats are never used.
- **Dates:** occurrence dates are stored as local calendar dates (`YYYY-MM-DD`) in the user's timezone. Timestamps are stored in UTC.
- **Derived values are never stored.** Balances, loan progress, lending status and budget usage are always computed from transactions.

### 5.2 Tables

**`profiles`**: `id (= auth user id)`, `display_name`, `base_currency` (ISO 4217, default `BDT`), `timezone`, `number_grouping` (`south_asian` | `western`), `nudge_enabled` (bool), `nudge_time` (default `21:00`), `lending_reminder_interval_days` (default 3), `theme` (`system` | `light` | `dark`), `app_lock_enabled`, `onboarded_at`.

**`accounts`**: `name`, `type` (`cash` | `bank` | `mobile_wallet` | `card` | `savings`), `opening_balance_minor` (may be negative for cards), `opening_date`, `color`, `icon`, `sort_order`, `archived_at`.

**`categories`**: `name`, `kind` (`income` | `expense`), `icon`, `color`, `sort_order`, `archived_at`. Seeded per user at signup.
- *Expense:* Food, Groceries, Transport, Bills & Utilities, Rent, Health, Shopping, Family, Education, Fun, Personal Care, Gifts, Other.
- *Income:* Salary, Project / Freelance, Bonus, Refund, Other.

**`parties`**: `name`, `kind` (`person` | `company`), `phone` (E.164, optional), `note`, `archived_at`.

**`transactions`** (the single record of all money movement):

| Column | Notes |
|---|---|
| `type` | `expense` · `income` · `transfer` · `emi` · `lending_out` · `lending_in` |
| `amount_minor` | Always > 0. The direction comes from `type` |
| `account_id` | Required. For transfers, this is the source account |
| `to_account_id` | Required only for `transfer` (and must differ from `account_id`) |
| `category_id` | Required for `expense` and `income`, null otherwise |
| `party_id` | Optional (salary source, client, shop, person) |
| `occurred_on` / `occurred_at` | Local date (for grouping) plus timestamp |
| `note` | Optional |
| `original_amount_minor`, `original_currency`, `fx_rate` | Optional, all-or-none. `fx_rate` is stored as a decimal string |
| `recurring_rule_id`, `occurrence_date` | Set when the transaction was created from a recurring rule |
| `loan_id`, `installment_number` | Required for `emi` |
| `lending_id` | Required for `lending_out` and `lending_in` |

Balance effect on `account_id`: `income` and `lending_in` add the amount; `expense`, `emi` and `lending_out` subtract it; a `transfer` subtracts from `account_id` and adds to `to_account_id`.

Reporting: "Spending" = `expense` only. "Debt payments" = `emi`. "Income" = `income` only. Transfers and lending movements are excluded from both spending and income.

**`recurring_rules`**: `type` (`income` | `expense` | `transfer`), `amount_minor`, `account_id`, `to_account_id`, `category_id`, `party_id`, `note`, `frequency` (`weekly` | `monthly` | `yearly`), `interval` (≥1), `anchor_date` (first occurrence), `end_date` (nullable), `mode` (`confirm` | `auto`), `paused_at`.

**`recurring_skips`**: `rule_id`, `occurrence_date`. Records a "skip this one" so the occurrence stops showing as due.

**`loans`** (EMIs the user pays): `name`, `party_id` (lender), `emi_amount_minor`, `total_installments`, `first_due_date`, `installments_paid_before` (EMIs already paid before the user started using Hisab, default 0), `default_account_id`, `note`, `closed_at`.

**`lendings`**: `party_id` (required), `direction` (`lent` | `borrowed`), `principal_minor`, `started_on`, `due_on` (nullable), `reminder_interval_days` (nullable; falls back to the profile setting), `note`, `closed_at`.

When a lending is created, the user picks an account (which creates the matching movement: `lending_out` for lent, `lending_in` for borrowed) or chooses **"Happened before Hisab"** (no transaction is created and the account balance is unaffected).

**`lending_reminders_sent`**: `lending_id`, `channel` (`whatsapp` | `sms` | `other`), `sent_at`. This is the reminder history shown on the person's screen.

**`budgets`**: `category_id` (nullable; null means the overall monthly budget), `amount_minor`. Budgets are monthly. At most one active budget per category (and one overall).

### 5.3 Database constraints (enforced in Postgres)
- `amount_minor > 0` on transactions, recurring rules, loans, lendings and budgets.
- Per-`type` column requirements on `transactions`, implemented as `CHECK` constraints matching the table above.
- `UNIQUE (recurring_rule_id, occurrence_date) WHERE deleted_at IS NULL`, which prevents duplicate recurring entries from multiple devices.
- `UNIQUE (loan_id, installment_number) WHERE deleted_at IS NULL`.
- Foreign keys must belong to the same `user_id`, enforced by RLS plus composite checks.
- RLS on every table: `user_id = auth.uid()` for select, insert, update and delete.

---

## 6. Domain rules (`packages/core`)

All functions are pure, deterministic, take an explicit `today` and timezone, and are fully unit-tested.

### 6.1 Money
- `parseAmount(input) → minor units`. Accepts `1450`, `1,450`, `1450.5`. Rejects more than 2 decimal places, negative numbers and zero.
- `formatMoney(minor, currency, grouping, opts)` returns `{ code, number }` so the UI can render the ISO code smaller and lighter than the number. Examples: `BDT 2,48,350` (south_asian) and `BDT 248,350` (western). `.00` is hidden in lists and shown dimmed on the balance hero. Compact form for tiles: `4.2L` (lakh) and `1.2Cr` in south_asian, `420K` and `1.2M` in western.
- FX: `baseAmount = round_half_even(original × rate)`.

### 6.2 Balances
- `accountBalance = opening_balance + Σ signed effects` (see §5.2).
- `totalBalance = Σ balances of non-archived accounts`.
- The balance trend line on Home shows the end-of-day total for the last 30 days.

### 6.3 EMI loans
Let `paid = installments_paid_before + count(emi transactions for loan)`.
- `monthsLeft = max(0, total_installments − paid)`
- `paidAmount = installments_paid_before × emi_amount + Σ emi transaction amounts`
- `remainingAmount = monthsLeft × emi_amount`
- `nextDueDate = addMonthsClamped(first_due_date, paid)`. Clamped means a due day of the 31st falls on the last day of shorter months.
- `isOverdue = nextDueDate < today` and `monthsLeft > 0`
- `debtFreeBy = addMonthsClamped(start, monthsLeft − 1)`, where `start = nextDueDate` if `nextDueDate ≥ today`; otherwise `start` is the first date in the loan's schedule (`first_due_date + k months`) that is on or after today. In other words, overdue EMIs push the finish date back instead of being assumed paid in the past.
- "Mark paid" creates an `emi` transaction with `installment_number = paid + 1`, the default account, and the EMI amount (editable). When `monthsLeft` reaches 0, the UI offers to close the loan.

### 6.4 Lending
- For **lent**: `outstanding = principal − Σ lending_in`. For **borrowed**: `outstanding = principal − Σ lending_out`.
- Status is `settled` (outstanding ≤ 0, or closed), `overdue` (`due_on < today`), `partly_paid`, or `open`.
- "Owed to you" on Home = Σ outstanding of open **lent** lendings. "You owe" = Σ outstanding of open **borrowed** lendings, shown alongside "Loans left".
- Reminder message template (editable before sending): *"Hi {name}, just a gentle reminder about the {CODE} {amount} from {started_on}. Let me know when it works for you. Thanks!"* WhatsApp opens via `https://wa.me/{phone}?text=…` and SMS via `sms:{phone}?body=…`. Tapping either records a row in `lending_reminders_sent`.

### 6.5 Recurring
- `occurrences(rule, from, to)` generates dates by frequency and interval from `anchor_date`, clamped to month end and stopping at `end_date`.
- **Due items** = occurrences from `max(anchor_date, rule.created_at date)` up to today that have no transaction and no skip. Confirm mode shows them in Home's "Due soon" strip with a ✓ button. Tapping ✓ posts the transaction; long-pressing opens it in the quick-log sheet so the amount can be edited first.
- **Auto mode** posts any due occurrences when the app is opened or brought to the foreground. The unique constraint makes this safe across devices: a duplicate is rejected and quietly dropped.
- "Due soon" also lists occurrences, EMIs and lending due dates within the **next 7 days**.

### 6.6 Budgets
- `spent(category, month)` = Σ `expense` in that category for the month. The overall budget uses Σ of all `expense` transactions.
- `safeToSpendPerDay = max(0, overallBudget − overallSpent) / daysLeftInMonth (today inclusive)`. This is shown only when an overall budget exists.
- Thresholds of 80% and 100% trigger a notification once per category per month, checked whenever a transaction is saved.

### 6.7 Quick-log suggestions
- Candidates are `(category, amount, note)` tuples from `expense` transactions in the last 60 days.
- `score = frequency × recency_decay(half-life 14 days) × hour_proximity(current hour vs. typical hour, Gaussian σ = 2h)`.
- Show the top 3. Tapping a suggestion logs it immediately with that tuple, the last-used account for that category, and the current time.
- Category chips show the top 4 expense categories by the same scoring (without amount), followed by "⋯" for all categories.

### 6.8 Notification planning
`planNotifications(state, today) → list of {id, fireAt, title, body, deepLink}` is pure, and the mobile app reconciles it with `expo-notifications` (cancelling stale entries and scheduling new ones). It runs whenever local data changes (debounced) and when the app is brought to the foreground. The planning window is 30 days, kept under the iOS limit of 64 pending notifications by priority: EMI > lending > recurring > nudge.

| Kind | Schedule | Deep link |
|---|---|---|
| EMI due | 1 day before at 10:00, and on the due day at 10:00, until marked paid | Loan detail |
| Lending due/overdue | `due_on` at 10:00, then every `reminder_interval_days` at 10:00 until settled | Person detail (WhatsApp/SMS ready) |
| Recurring due (confirm mode) | Occurrence date at 10:00 | Home with the due item highlighted |
| Budget 80% / 100% | Immediately when the threshold is crossed | Plan → Budgets |
| Daily nudge | Each day at `nudge_time`, **skipped if any transaction was logged that day** | Quick-log sheet opened |

---

## 7. UX and UI

### 7.1 Visual language ("C1 + C2")
- **Light theme:** page `#F5F5F3`, surfaces white with a 1px `#EAEAE5` border, text `#141414`.
- **Dark theme:** page `#0C0C0D`, surfaces `#161718` with a `#232427` border, text `#EDEDEC`.
- **Hero card:** dark "ink" radial gradient (`#2B2E35 → #121315`) with a soft highlight, used in both themes.
- **Brand color is ink:** the + button, active tab, progress bars and primary buttons use the text color. There's no decorative accent color.
- **Color carries meaning only:**

  | Meaning | Light | Dark |
  |---|---|---|
  | Positive / owed to you | `#15803D` | `#4ADE80` |
  | Warning / overdue | `#D97706` | `#FBBF24` |
  | Over budget | `#EA580C` | `#EA580C` |

  Category icons sit on soft, per-category tinted squares.
- **Type:** Inter (web) and the system font (SF Pro / Roboto) on mobile. All numbers use tabular figures with slight negative letter-spacing. Currency codes are rendered at 0.62em, weight 500, 45% opacity.
- **Shape:** card radius 18px, hero radius 24px, sheet radius 26px, chip radius 999px, icon tile radius 11px.
- **Motion:** sheet spring (Reanimated), the balance number animates to its new value, a new row highlights briefly, and haptics fire on save, ✓ and undo. Motion respects the system's reduced-motion setting.
- Every token lives in `packages/tokens`, and both apps consume only tokens, never hard-coded values.

### 7.2 Navigation
- **Mobile:** four tabs (**Home · Activity · Plan · People**) plus a floating **+** button. Settings opens from the avatar on Home.
- **Web:** a left sidebar with the same four areas plus Reports and Settings. Press `N` to open quick-log, and ⌘K / Ctrl+K for the command bar.

### 7.3 Screens
- **Home:** header with the avatar → ink hero card (total balance with a dimmed `.00`, 30-day trend line, "Owed to you" and "Loans left" tiles; tap the balance to hide amounts) → **Due soon** strip (EMIs, recurring items and lendings in the next 7 days or overdue; loan chips show "9 of 24 · 15 left"; overdue items marked amber) → **Today** list with the day's total.
- **Quick-log sheet:**
  - A type segment (Expense · Income · Transfer · Lend), with Expense as the default.
  - "Suggested now" chips; one tap logs immediately.
  - A large amount display with a built-in number pad (the system keyboard is never used).
  - Category chips (top 4 plus ⋯).
  - Small meta chips for account (last used for that category), date (default now) and note.
  - A Save button, followed by haptics, the sheet closing, the balance animating and a toast with **Undo (5 s)**.
  - Income shows party and category chips, plus an optional "Received in another currency" row (original amount, currency, rate, and the calculated BDT amount).
  - Transfer shows from and to account chips.
  - Lend shows a person picker, Lent/Borrowed, an optional due date, and an account or "Happened before Hisab".
- **Activity:**
  - Search and filter chips (month, account, category, type, person).
  - An In / Out / Net summary card for the month.
  - Day-grouped lists with daily totals; transfers are shown in grey.
  - Swipe to delete (with Undo) and tap to edit in the same sheet.
- **Plan:** a segmented control for **Budgets** (overall card with "safe to spend per day", per-category bars, orange when over), **Recurring** (rules with next date, mode and pause), and **Loans** (cards with progress → Loan detail).
- **Loan detail:** a progress ring ("15 months left"), amounts paid and remaining, "Debt-free by", a "Next EMI" card with **✓ Mark paid**, and the payment history.
- **People:** a list of parties sorted by outstanding amount (people who owe you first), with a search box.
- **Person detail:**
  - Avatar initial, name and masked phone number.
  - An outstanding card ("Rafiq owes you BDT 10,000 · 6 days overdue") with **WhatsApp · SMS · Got paid** buttons.
  - An editable message preview.
  - The history, covering lendings, repayments, reminders sent, and related income/expense with that party.
- **Settings:**
  - Profile, accounts (reorder and archive), categories, base currency, number grouping, theme, nudge time, lending reminder interval, app lock and hide amounts.
  - Monthly report, export (CSV/PDF), unsynced issues, sign out, delete account.
- **Monthly report:** income by source (party), spending by category (bar list), EMIs paid, lending in and out, net and savings rate, and a comparison with last month. Exported to PDF via `expo-print` (mobile) and server-rendered printable HTML (web).
- **Onboarding (target under 2 minutes):** sign in → base currency (BDT preselected) → accounts with current balances → *optional:* running loans (with EMIs already paid) → *optional:* people who owe you or whom you owe → Home.
- **Empty states:** each one has a single clear next action (for example "Log your first expense" opens the sheet). No illustrations.

### 7.4 Web specifics
- Home becomes a two-column dashboard: hero and Due soon on the left; month In/Out, a category breakdown chart and budgets on the right.
- Activity becomes a dense, sortable, virtualized table with inline edit and multi-select bulk actions (recategorize, delete).
- Quick-log is a dialog with keyboard flow: type the amount → Tab → type to pick a category → Enter.

### 7.5 Accessibility
- Every interactive element has a minimum touch target of 44×44pt and an accessible label. Amounts are read as "minus 1,450 taka" or "1,450 BDT".
- Color is never the only signal: overdue items also have a "● overdue" text label.
- Text contrast meets WCAG AA in both themes.

---

## 8. Auth and security
- **Supabase Auth:** email one-time code, Google, and Sign in with Apple (required by App Store rules when Google is offered).
- **Sessions:** stored in `expo-secure-store` on mobile and in httpOnly cookies on web (Supabase SSR helpers).
- **Optional biometric app lock** (`expo-local-authentication`) when the app opens or resumes after 1 minute in the background.
- **Hide amounts:** tap the hero card to blur amounts throughout the app. The setting persists.
- **No service-role keys** in any client. Server-only operations (account deletion) run in a Supabase Edge Function that verifies the user's JWT.
- **Account deletion** hard-deletes all of the user's rows and the auth user. **Export all data** produces a ZIP of CSVs, one per table.

---

## 9. Error handling
- **An entry you've logged is never lost.** Every write goes to local SQLite first and can't fail because of the network.
- **Upload failures:**
  - Network or 5xx errors retry with exponential backoff (capped at 5 minutes) and resume on reconnect or foreground.
  - 4xx validation errors move the entry to "Unsynced issues" with the reason shown, and the user can edit or discard it.
- **Sync status indicator** (subtle, in the Home header): "Up to date" / "Syncing" / "Offline · N pending" / "N issues".
- **Validation** (zod in `packages/db`) runs before the local write and shows inline errors inside the sheet. Pop-up alerts are never used.
- Destructive actions use **Undo** (soft delete) instead of confirmation dialogs, except for account deletion, which requires typing a confirmation.
- Crash and error reporting through Sentry (mobile and web), with amounts and notes scrubbed.

---

## 10. Testing strategy
- **`packages/core`:** Vitest, written test-first, with ~100% branch coverage. Required cases:
  - EMI: month-end clamping (31st → February), late payments, `installments_paid_before`, loan completion.
  - Recurring: weekly, monthly and yearly with intervals, `end_date`, skips, timezone day boundaries.
  - Lending: partial repayments, both directions, overpayment.
  - Money: parsing, formatting for both grouping styles, compact formatting, FX rounding.
  - Budgets: safe-to-spend on the last day of the month.
  - Suggestion ranking and notification planning (including the 64-notification cap).
- **Database:** pgTAP tests for RLS (cross-user reads and writes rejected), CHECK constraints, and the unique recurring and installment constraints.
- **Web E2E:** Playwright, covering sign-in, quick-log via `N`, editing in the Activity table, and generating and exporting the monthly report.
- **Mobile E2E:** Maestro, covering onboarding; quick-log by suggestion and by number pad; offline logging → reconnect → appears on web; EMI mark paid; lending → WhatsApp intent → Got paid.
- **CI** (GitHub Actions): typecheck, lint, unit tests and database tests on every PR. E2E runs on main.

---

## 11. Build order (one implementation plan per milestone)
1. **Foundation:** monorepo, tokens, Supabase project and migrations with RLS, Auth on both apps, PowerSync wired end to end, app layouts (tabs and sidebar), theme switching.
2. **Logging core (mobile first):** accounts, categories, parties, quick-log sheet (number pad, suggestions, undo), Home (hero, Today), Activity, transfers, FX income.
3. **Plan:** recurring rules (confirm and auto, skips, Due soon strip), EMI loans and loan detail, budgets with safe-to-spend.
4. **People:** lendings in both directions, person detail, WhatsApp/SMS reminders, notification planner and scheduler, daily nudge, budget alerts.
5. **Web app:** dashboard, Activity table with bulk edit, web quick-log and ⌘K, monthly report, CSV/PDF export, data export.
6. **Polish and beta:** onboarding, empty states, motion and haptics pass, accessibility pass, app lock and hide amounts, account deletion, Sentry, EAS builds installed on the owner's phone.

Each milestone ends in a usable state. After milestone 2 the owner can start logging daily on their phone.

---

## 12. Open items deferred to later versions
- v1.1: home-screen widget (balance + quick add), web push notifications.
- Later: receipt photos, accounts held in a foreign currency, amortization with interest and prepayment simulation, billing and subscriptions for public users.
