# Hisab

Personal finance tracker that you actually keep up with: log a payment in 3 seconds, see what you have,
what's due, how many EMI months are left, and who owes you money.

- **Spec:** `docs/superpowers/specs/2026-10-06-hisab-design.md`
- **Plans:** `docs/superpowers/plans/`

## Stack

| Path | What |
|---|---|
| `apps/web` | Next.js 16 (App Router, Tailwind v4, proxy auth gate) |
| `apps/mobile` | Expo SDK 57 (Expo Router, NativeWind 4) |
| `packages/core` | Pure TS domain logic (money formatting, sign-in flow, …) |
| `packages/db` | PowerSync local SQLite schema, zod validators, Supabase upload connector |
| `packages/tokens` | Design tokens shared by both apps |
| `supabase/` | Postgres migrations (RLS, constraints, signup seed), email templates, DB tests |
| `powersync/` | Sync rules + setup guide |

Local-first: both apps read and write a local SQLite database and PowerSync syncs it with Supabase.
Until PowerSync is configured (see `powersync/README.md`) the apps run in "On this device" mode.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local     # fill in Supabase URL + publishable key
cp apps/mobile/.env.example apps/mobile/.env     # same values, EXPO_PUBLIC_ prefix
```

### Sign-in emails must contain the 6-digit code (one-time)

The apps sign in with an emailed **code**, not a link. Supabase's default templates only contain a link,
so update the project once — either:

- **Dashboard:** Authentication → Emails → Templates. In both **Magic Link** and **Confirm signup**, set the
  subject to `Your Hisab code: {{ .Token }}` and paste `supabase/templates/otp.html` as the body.
  Then Authentication → Sign In / Providers → Email: make sure **Email OTP length = 6**.
- **CLI:** `supabase login && supabase link --project-ref qopvfcrjpdlsnwughqlx && supabase config push`
  (pushes the templates from `supabase/config.toml` — review the diff it shows before confirming, since it
  also pushes the other auth settings in that file).

## Run

```bash
pnpm --filter @hisab/web dev              # http://localhost:3000
pnpm --filter @hisab/mobile start         # needs a dev build (op-sqlite is native — not in Expo Go)
```

Mobile dev build: `cd apps/mobile && npx eas-cli@latest build --profile development --platform android`
(install the APK on your phone, then `pnpm --filter @hisab/mobile start`).

## Test

```bash
pnpm turbo run typecheck test                         # unit tests + typecheck, all packages
DATABASE_URL=postgresql://... ./scripts/db-test.sh    # database tests (rolled back, safe on any DB)
```
