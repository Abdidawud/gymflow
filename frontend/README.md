# GymFlow — Frontend

Staff-facing web app for gym membership and payment tracking (Version 1), built with **Next.js 16 (App Router)**,
**React 19**, **TypeScript** and **Tailwind CSS 4**. The interface is bilingual: **Amharic (default) and English**.

Sources of truth (in `../stitch_design_system_generator/` and `..`):

| Document                                                      | Used for                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `design.md`                                                   | Scope, screens, copy, permissions, date/status rules, required UI states |
| `kinetic_operational_saas/DESIGN.md` + `gymflow_*/screen.png` | Visual language (tokens, type scale, layout, components)                 |
| `../backend-database-system-design.md`                        | API contract (`/api/v1`), error model, idempotent payments               |

When a Stitch mockup and `design.md` disagree, `design.md` wins (see [Design decisions](#design-decisions)).

## Quick start

```bash
# Node 20.9+ (Node 24 LTS recommended). This machine uses nvm:
source ~/.nvm/nvm.sh

npm install
npm run dev          # http://localhost:3000
```

The app runs against an **in-browser mock backend** by default (`NEXT_PUBLIC_API_MODE=mock`), so no server is needed.
Demo accounts (also listed on the sign-in screen in demo mode):

| Role                                   | Email                     | Password       |
| -------------------------------------- | ------------------------- | -------------- |
| Administrator                          | `abdi@adamafitness.com`   | `GymFlow#2026` |
| Receptionist                           | `tigist@adamafitness.com` | `GymFlow#2026` |
| First sign-in (forced password change) | `selam@adamafitness.com`  | `Welcome#2026` |

The mock's "today" is frozen at the design fixture date, **Oct 07, 2026** (Africa/Addis_Ababa), so the data matches
the spec: Abebe Kebede GYM-00124 is Active with 23 days left, Hana Tesfaye is Expiring Soon, and so on.
Demo changes are saved in `localStorage`; **My Account → Reset Demo Data** restores the original data set.

## Scripts

| Command                       | What it does                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Development server                                                                                    |
| `npm run build` / `npm start` | Production build / server                                                                             |
| `npm run check`               | Type-check + lint + unit tests                                                                        |
| `npm test`                    | Unit tests (Vitest): date math, money, phones, membership rules, seed integrity                       |
| `npm run test:e2e`            | Playwright end-to-end tests against a production build (first run: `npx playwright install chromium`) |
| `npm run format`              | Prettier (with Tailwind class sorting)                                                                |

## Configuration

Set in `.env` (committed defaults) or override in `.env.local` / the deployment environment.

| Variable                       | Default      | Purpose                                                           |
| ------------------------------ | ------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_API_MODE`         | `mock`       | `mock` = in-browser demo backend; `http` = real backend           |
| `NEXT_PUBLIC_API_BASE_URL`     | `/api/v1`    | Backend base URL (same-origin path or absolute URL)               |
| `NEXT_PUBLIC_CSRF_COOKIE_NAME` | `gf_csrf`    | Readable cookie whose value is echoed in `X-CSRF-Token` on writes |
| `NEXT_PUBLIC_MOCK_TODAY`       | fixture date | Mock only: `live` follows the real gym date, or set `YYYY-MM-DD`  |
| `NEXT_PUBLIC_DEFAULT_LOCALE`   | `am`         | Language before anyone chooses one: `am` (Amharic) or `en`        |

In mock mode the sidebar shows a **"Demo mode · sample data"** badge, so a deployment can't be mistaken for live data.
**Before going live, set `NEXT_PUBLIC_API_MODE=http`.**

## Architecture

```
src/
  app/                    Routes (thin server components: guards + Suspense)
    (auth)/               login, forgot-password, reset-password, change-password
    (app)/                authenticated shell: dashboard, members, payments, memberships,
                          plans, reports, users, settings, account
  components/
    ui/                   design-system primitives (Button, Field, Dialog/Sheet, Table, Badge, …)
    shell/                AppShell, sidebar, header, auth gate, permission guard
    charts/               accessible SVG revenue chart (area/column, keyboard tooltips, data table)
  features/<area>/        screens and feature components (members, payments, plans, …)
  i18n/                   translator, formatters, locale provider; messages/{en,am}/<namespace>.ts
  lib/
    api/                  contract.ts (API surface), types.ts (DTOs), http-client.ts, errors.ts
      mock/               mock backend: deterministic seed + business rules
    domain/               pure rules shared by UI and mock: dates, money, phone, membership status
  providers/              React Query client, auth/session, theme
```

Key behaviors:

- **Auth**: cookie session (`credentials: "include"`), `GET /auth/me` on load, any 401 clears cached data and returns
  to sign-in with a safe `next` path and the "Your session expired" message. Temporary passwords force `/change-password`.
- **Permissions**: navigation and actions follow `account.permissions`; admin screens render "You don't have permission
  to view this page" for receptionists. The backend must enforce the same rules.
- **Payments**: one shared drawer (`usePaymentDrawer()`); `POST /payments/preview` drives the dates shown; confirmation
  sends the preview fingerprint and an `Idempotency-Key`. The key is reused on retries; a lost response shows an
  "uncertain" state that re-checks with the same key, so a payment is never recorded twice.
- **Data**: TanStack Query; list filters live in the URL (they survive opening a record and coming back); successful
  payments invalidate members, memberships, payments, dashboard and reports.
- **Themes**: Light/Dark/System, applied before first paint, saved to the account. Receipts always print on white.
- **Language**: Amharic or English, switchable from the header, the sign-in screen and My Account (see
  [Languages](#languages)).
- **Security headers** (production): CSP, `frame-ancestors 'none'`, `nosniff`, strict referrer and permissions policies.

## Connecting the real backend

1. Implement the endpoints in `src/lib/api/contract.ts` (each method names its endpoint), returning the DTOs in
   `src/lib/api/types.ts`. The mock (`src/lib/api/mock/mock-api.ts`) is a working reference for every rule.
2. Set `NEXT_PUBLIC_API_MODE=http` (and `NEXT_PUBLIC_API_BASE_URL` if the API is on another origin; add that origin to
   CORS with credentials and it's automatically allowed by the CSP).
3. Run `npm run test:e2e`; the flows should pass unchanged against seeded backend data.

Contract details beyond `backend-database-system-design.md` that the backend needs to match:

| Item                               | Shape / behavior                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/me`, `POST /auth/login` | `{ account, gym }`. `gym` = `{ name, currency, timezone, today, expirationWarningDays, enabledPaymentMethods, hasPlans }` — operational context receptionists need without `/settings` access; `today` is the gym-timezone date                       |
| Error envelope                     | `{ error: { code, message, fieldErrors?, details?, requestId } }`; codes in `src/lib/api/errors.ts` (e.g. `DUPLICATE_PHONE` with `details.member`, `DATE_CONFLICT`, `STALE_PREVIEW`, `IDEMPOTENCY_CONFLICT`, `LAST_ADMINISTRATOR`, `SESSION_EXPIRED`) |
| `GET /members`                     | Also accepts `phone` (exact match after normalization, used for duplicate warnings), `archived=true`, `sort=name\|memberCode\|endDate\|registrationDate`, `order`                                                                                     |
| `GET /members/{id}`                | Includes `upcoming[]`, `paymentCount`, `membershipCount`, `permittedActions`                                                                                                                                                                          |
| `GET /memberships`                 | Includes `counts` for the status tabs (Active includes Expiring Soon)                                                                                                                                                                                 |
| `GET /payments`                    | Includes `summary: { totalRevenue, transactions }` for administrators, `null` otherwise                                                                                                                                                               |
| `POST /payments`                   | `201 { payment }` when recorded, `200 { payment }` for a replay of the same key and body                                                                                                                                                              |
| `GET /plans`                       | Each plan includes `activeMemberCount` and `isReferenced`                                                                                                                                                                                             |
| `POST /settings/logo`              | Multipart upload of the optional gym logo (validated like member photos)                                                                                                                                                                              |
| `Accept-Language`                  | Sent on every request (`am` or `en`); `message` and `fieldErrors` should be in that language. `src/i18n/messages/*/api.ts` lists the messages the mock returns                                                                                        |
| Account `language`                 | `account.language` (`"am"`\|`"en"`) in `/auth/me`; saved with `PATCH /account/preferences { language }` alongside `appearance`                                                                                                                        |

## Languages

Amharic is the default; each staff member can switch to English. The interface language follows this order:

1. A language picked on the sign-in screen is used and saved to the account at sign-in.
2. Otherwise, signing in applies the language saved on the account, so it follows the person to any device.
3. Changing it later (header switcher or **My Account → Language**) takes effect immediately on this device and is
   saved to the account.

How it works:

- **Catalogs**: `src/i18n/messages/en/*.ts` is the source; `am/*.ts` must match its shape (`Messages` type), so a missing
  Amharic message fails the build. Keys are type-checked (`t("members.list.title")`). A unit test also checks that
  every Amharic message keeps the English `{placeholders}` and `<b>`/`<link>` tags.
- **Plurals** use `{ one, other }` with `Intl.PluralRules`; `rich()` renders `<b>` and `<link>` tags as React nodes so
  translators can reorder sentences freely.
- **Formatting**: `f.date`, `f.money`, `f.days`, … in `src/i18n/translator.ts`. Dates keep one layout in both languages
  ("ኦክቶ 07, 2026" / "Oct 07, 2026") on the Gregorian calendar the backend uses; amounts show "ብር" in Amharic.
- **Font**: Noto Sans Ethiopic is loaded for Ethiopic text, and letter-spacing is turned off for Amharic.
- **Page titles** are set on the client in the current language.
- **Data stays as entered.** Plan names, member names and notes are not translated.

To add a language: add it to `LOCALES` in `src/i18n/config.ts`, create `src/i18n/messages/<code>/` mirroring `en/`, and
add it to the catalogs in `src/i18n/translator.ts`.

> The Amharic copy was written for this project and should be reviewed by a native-speaking staff member before
> launch, especially for terms the gym already uses at the front desk.

## Design decisions

- **Spec over mockups.** Stitch screens added things outside Version 1: auto-reminders, RFID lookup, date of birth,
  terminals/branches, "Telebirr"-branded methods and the sign-in page inside the app shell. Those were left out; the
  sign-in screen uses the spec's split layout.
- **Counts are derived, not fixed.** `design.md` states "287 + 35 + 8 = 350", which actually sums to 330. All counts
  are computed from data, so they always reconcile. The demo has 350 current members: 306 Active (incl. 20 Expiring
  Soon), 35 Expired, 8 Unpaid, 1 Scheduled.
- **Expiring Soon uses continuous coverage.** A member who has already prepaid a back-to-back renewal is not flagged
  Expiring Soon; remaining days are measured to the end of the uninterrupted paid chain. _Confirm with the backend._
- **Scheduled members** buying again default to the day after their scheduled coverage (editable); overlapping dates
  are rejected with a date conflict, per the backend design.
- **Charts** are hand-built SVG (no chart library): single series, primary hue validated for contrast in both themes,
  keyboard-readable tooltips and a data-table view.

## Known limitations

- The unsaved-changes prompt covers in-app links, Cancel and closing/reloading the tab, but not the browser Back button.
- Demo data lives per browser; it syncs between tabs but not between devices.
- Dates use the Gregorian calendar in both languages; an Ethiopian-calendar display is not included.
