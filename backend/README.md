# GymFlow — API

The GymFlow backend: a TypeScript service on **Fastify 5** with **PostgreSQL 18**, implementing
[`../backend-database-system-design.md`](../backend-database-system-design.md) under `/api/v1`. The web app in
`../frontend` uses it in http mode (it proxies `/api/v1` here, so the browser sees one origin).

Business rules (membership status, renewal dates, money, phone numbers, password policy, the Ethiopian calendar)
and the API contract types come from [`../packages/shared`](../packages/shared), the same code the web app uses, so
the two cannot disagree.

## Quick start (development)

```bash
# from the repo root
npm install

# PostgreSQL: any server works. Without Docker or sudo (Ubuntu), the helper unpacks one into ~/.local:
scripts/local-postgres.sh install && scripts/local-postgres.sh init   # once; prints where the credentials are
scripts/local-postgres.sh start                                        # after each reboot

cp backend/.env.example backend/.env      # fill in DATABASE_URL, MIGRATION_DATABASE_URL, SESSION_SECRET
npm run migrate -w backend                # create the schema
npm run seed:demo -w backend              # optional: the demo gym (staff password GymFlow#2026)
# or, for a real gym, the first administrator:
npm run admin:create -w backend -- --email you@gym.et --name "Your Name"

npm run dev                               # API on :4000 and web app on :3000, wired together
```

With `FIXED_TODAY=2026-10-07` in `.env`, "today" is frozen at the design date (Meskerem 27, 2019 E.C.) so the demo
data matches the design fixtures. Remove it to follow the real date in Africa/Addis_Ababa.

## Commands

| Command (in `backend/`)                      | What it does                                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                | API with reload (`tsx watch`)                                 |
| `npm run build` / `npm start`                | Bundle to `dist/` (shared code included) / run the bundle     |
| `npm run migrate`                            | Apply pending migrations and the application-role grants      |
| `npm run admin:create -- --email E --name N` | Bootstrap an administrator (prints a temporary password once) |
| `npm run seed:demo [-- --reset]`             | Load the demo gym (refused in production)                     |
| `npm run cli -- db:reset`                    | Drop and recreate the schema (refused in production)          |
| `npm test`                                   | Integration tests against a real PostgreSQL test database     |
| `npm run typecheck` / `npm run lint`         | TypeScript and ESLint                                         |

The web app's end-to-end tests can run against this API:
`cd frontend && E2E_API_MODE=http npx playwright test` (uses `backend/.env.e2e`; its database is reset each run).

## Configuration

All settings are environment variables, validated at startup (`src/config.ts`); see [`.env.example`](.env.example).
In production the server refuses to start with development shortcuts: `FIXED_TODAY`, `MAIL_TRANSPORT=log`,
non-HTTPS `APP_ORIGIN` or insecure cookies.

| Variable                     | Purpose                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`               | The API's connection — use the least-privileged application role             |
| `MIGRATION_DATABASE_URL`     | Schema owner for migrations and the CLI                                      |
| `DATABASE_APP_ROLE`          | Role that migrations grant data privileges to (e.g. `gymflow_app`)           |
| `APP_ORIGIN`                 | Public origin of the web app: origin checks and password-reset links         |
| `SESSION_SECRET`             | 32+ random characters (CSRF tokens)                                          |
| `TRUST_PROXY`                | Which reverse proxies to trust for client IPs (`loopback`, a hop count, …)   |
| `MAIL_TRANSPORT`, `SMTP_URL` | `smtp` in production; `log` prints emails in development                     |
| `STORAGE_DIR`                | Private folder for member photos and the logo — back it up with the database |

## Design

```
src/
  server.ts, app.ts       entry point (graceful shutdown) and app composition
  config.ts               validated environment
  http/                   request context, access control (session, CSRF, origin, roles), errors, validation
  modules/                one file per area: auth, members, memberships, plans, payments, dashboard,
                          reports, staff, settings, health
  services/               members/periods & DTOs, payments, sessions, passwords, audit, mail outbox,
                          images, storage, background jobs
  db/                     pool & type parsers, Kysely table types, migration runner
  lib/                    i18n messages (am/en), errors, clock, crypto, text clean-up
migrations/               versioned SQL (checksummed; never edit an applied file)
test/                     integration tests (real app, real PostgreSQL, least-privileged role)
```

Key decisions:

- **The database guards the money.** An exclusion constraint makes overlapping coverage impossible; checks enforce
  end = start + duration − 1 and positive decimal amounts; a trigger requires the payment amount to equal the
  purchased period's price; posted payments, periods and audit events are immutable (triggers, and the application
  role has no UPDATE/DELETE on them).
- **Status is derived, never stored.** Each read loads the periods that matter as of today and applies the shared
  rules, so nothing depends on a nightly job.
- **Idempotent payments.** `POST /payments` reserves the `Idempotency-Key` in the same transaction that locks the
  member and writes the period, payment and audit event. A retry with the same key and body returns the original
  payment (200); a different body is refused (409); a concurrent purchase for the same member must re-preview
  (`STALE_PREVIEW`). A deferred constraint makes it impossible to commit a key without its payment.
- **Sessions.** Opaque 256-bit tokens in an HttpOnly cookie (`__Host-` prefixed over HTTPS); the database stores
  only SHA-256 digests. 12 h lifetime, 30 min idle, revoked on sign-out, password change/reset and deactivation.
  Writes need an allowed `Origin` and the `X-CSRF-Token` header (an HMAC of the session token).
- **Passwords.** Argon2id (19 MiB, t=2). Sign-in failures are counted per email in the database (5 per 10 minutes)
  and requests are rate-limited per IP; unknown emails take the same time as wrong passwords.
- **Password recovery** queues the email in an outbox in the same transaction; a background worker delivers it with
  retries and then erases the body (it contains the single-use link). Responses never reveal whether an account exists.
- **Photos and logo** are verified by content, re-encoded (strips GPS/camera metadata), stored under random keys
  outside any web root and served only to signed-in staff.
- **Language.** Errors follow `Accept-Language` (`am`, the default, or `en`) with the same wording as the web app;
  dates in messages and emails use the Ethiopian calendar. Data is stored with ISO dates.
- **Audit trail.** Payments, member archive/reactivation, plan changes, staff changes and settings changes are
  recorded with the actor, request ID and a short summary — never passwords or tokens.
- **Scale.** One gym: member lists evaluate statuses in memory after loading only the relevant periods (fast for
  thousands of members); payments, reports and histories are paginated or aggregated in SQL.

## Production

1. **PostgreSQL 14+** with the `btree_gist` extension (available on all major managed services). Create two roles:
   a schema owner and an application role (`DATABASE_APP_ROLE`), e.g.
   `CREATE ROLE gymflow_owner LOGIN PASSWORD '…'; CREATE ROLE gymflow_app LOGIN PASSWORD '…'; CREATE DATABASE gymflow OWNER gymflow_owner;`
2. **Build and migrate** on each deploy: `npm ci && npm run build -w backend && node backend/dist/cli.js migrate`
   (with `MIGRATION_DATABASE_URL` and `DATABASE_APP_ROLE` set). Ship `backend/dist`, `backend/migrations` and
   `node_modules`.
3. **Run** `NODE_ENV=production node --enable-source-maps backend/dist/server.js` under a supervisor (systemd,
   a container) behind a TLS-terminating reverse proxy. Build the web app with
   `NEXT_PUBLIC_API_MODE=http API_PROXY_TARGET=http://127.0.0.1:4000 npm run build -w frontend`.
4. **Probes:** `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (database reachable and migrations applied).
5. **Bootstrap** the first administrator with `node backend/dist/cli.js admin:create --email … --name …`.
6. **Backups:** schedule `scripts/backup.sh` daily (database dump plus `STORAGE_DIR`), keep copies off the server,
   and rehearse `scripts/restore.sh` into an empty database. Enable point-in-time recovery if your host offers it.
7. **Email:** set `MAIL_TRANSPORT=smtp`, `SMTP_URL` and `MAIL_FROM` for password recovery.

Before going live, confirm the open policy questions in the design (§18): fixed-day pricing, one member per phone
number, immutable payments (corrections need a separate workflow), session lengths and backup targets.
