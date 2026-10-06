# PowerSync setup (one-time)

Hisab is local-first: both apps read/write a local SQLite database and PowerSync syncs it with
Supabase Postgres. Until PowerSync is configured the apps still work, but data stays on the device.

1. **Database role for replication** — in the Supabase SQL editor run (pick your own password):
   ```sql
   create role powersync_role with replication bypassrls login password '<strong-password>';
   grant select on all tables in schema public to powersync_role;
   alter default privileges in schema public grant select on tables to powersync_role;
   ```
   The `powersync` publication already exists (migration `20261006231103_security`).
2. **Create a PowerSync Cloud instance** at https://powersync.com (free tier is enough) and connect it
   to the Supabase project `qopvfcrjpdlsnwughqlx` using the *direct* connection string with
   `powersync_role`.
3. **Client auth** — in the instance's *Client Auth* settings enable "Use Supabase Auth" (JWKS from
   `https://qopvfcrjpdlsnwughqlx.supabase.co/auth/v1/.well-known/jwks.json`).
4. **Sync rules** — paste `powersync/sync-rules.yaml` and deploy.
5. Put the instance URL in `NEXT_PUBLIC_POWERSYNC_URL` (web) and `EXPO_PUBLIC_POWERSYNC_URL` (mobile).
