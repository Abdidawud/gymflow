# GymFlow — Frontend

Staff-facing web app for gym membership and payment tracking (Version 1), built with **Next.js 16 (App Router)**,
**React 19**, **TypeScript** and **Tailwind CSS 4**. The interface is bilingual — **Amharic (default) and English** —
and uses the **Ethiopian calendar** for every date. The API lives in [`../backend`](../backend); business rules and the
API contract are shared with it through [`../packages/shared`](../packages/shared).

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

npm install          # at the repo root (npm workspaces)
npm run dev          # in frontend/: http://localhost:3000 on the in-browser mock API
# or, at the repo root, the full stack with the real API and PostgreSQL:
# npm run dev
```

On its own the app runs against an **in-browser mock backend** (`NEXT_PUBLIC_API_MODE=mock`), so no server is
needed; it implements the same rules as the real API, on the same demo data.
Demo accounts (also listed on the sign-in screen in demo mode):

| Role                                   | Email                     | Password       |
| -------------------------------------- | ------------------------- | -------------- |
| Administrator                          | `abdi@adamafitness.com`   | `GymFlow#2026` |
| Receptionist                           | `tigist@adamafitness.com` | `GymFlow#2026` |
| First sign-in (forced password change) | `selam@adamafitness.com`  | `Welcome#2026` |

The demo's "today" is frozen at the design fixture date, **Meskerem 27, 2019 E.C.** (Oct 07, 2026, Africa/Addis_Ababa), so the data matches
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

| Variable                       | Default      | Purpose                                                                    |
| ------------------------------ | ------------ | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_MODE`         | `mock`       | `mock` = in-browser demo backend; `http` = real backend                    |
| `NEXT_PUBLIC_API_BASE_URL`     | `/api/v1`    | Backend base URL (same-origin path or absolute URL)                        |
| `NEXT_PUBLIC_CSRF_COOKIE_NAME` | `gf_csrf`    | Readable cookie whose value is echoed in `X-CSRF-Token` on writes          |
| `NEXT_PUBLIC_MOCK_TODAY`       | fixture date | Mock only: `live` follows the real gym date, or set `YYYY-MM-DD`           |
| `NEXT_PUBLIC_DEFAULT_LOCALE`   | `am`         | Language before anyone chooses one: `am` (Amharic) or `en`                 |
| `API_PROXY_TARGET`             | —            | Build/dev time: forward `/api/v1` to the API, e.g. `http://127.0.0.1:4000` |

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
    api/                  contract.ts (API surface), http-client.ts, errors.ts
      mock/               in-browser mock backend (demo data from packages/shared)
  providers/              React Query client, auth/session, theme

../packages/shared/src/   used by this app and by the API
  api/                    DTO types (the contract) and error codes
  domain/                 dates, Ethiopian calendar, money, phone, membership status, member lists, permissions
  i18n/                   languages and Ethiopian date/time formatting
  demo/                   deterministic demo gym (mock database and backend seed)
```

Key behaviors:

- **Auth**: cookie session (`credentials: "include"`), `GET /auth/me` on load, any 401 clears cached data and returns
  to sign-in with a safe `next` path and the "Your session expired" message. Temporary passwords force `/change-password`.
- **Permissions**: navigation and actions follow `account.permissions`; admin screens render "You don't have permission
  to view this page" for receptionists. The backend enforces the same rules on every request.
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

The API is in [`../backend`](../backend). In http mode the app calls `/api/v1` on its own origin and Next.js forwards
it to the API (`API_PROXY_TARGET`, read when the app is built or `next dev` starts), so session cookies stay
first-party and no CORS is needed:

```bash
NEXT_PUBLIC_API_MODE=http API_PROXY_TARGET=http://127.0.0.1:4000 npm run dev    # or `npm run dev` at the repo root
```

To serve the app and the API from different origins instead, set `NEXT_PUBLIC_API_BASE_URL` to the API's absolute URL
(the CSP allows it automatically) and add the app's origin to the API's `ALLOWED_ORIGINS`.

`E2E_API_MODE=http npx playwright test` runs the end-to-end tests against the real API and a freshly seeded database.

Contract details beyond `backend-database-system-design.md` (DTOs in `packages/shared/src/api/types.ts`):

| Item                               | Shape / behavior                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/me`, `POST /auth/login` | `{ account, gym }`. `gym` = `{ name, currency, timezone, today, expirationWarningDays, enabledPaymentMethods, hasPlans }` — operational context receptionists need without `/settings` access; `today` is the gym-timezone date                                   |
| Error envelope                     | `{ error: { code, message, fieldErrors?, details?, requestId } }`; codes in `packages/shared/src/api/errors.ts` (e.g. `DUPLICATE_PHONE` with `details.member`, `DATE_CONFLICT`, `STALE_PREVIEW`, `IDEMPOTENCY_CONFLICT`, `LAST_ADMINISTRATOR`, `SESSION_EXPIRED`) |
| `GET /members`                     | Also accepts `phone` (exact match after normalization, used for duplicate warnings), `archived=true`, `sort=name\|memberCode\|endDate\|registrationDate`, `order`                                                                                                 |
| `GET /members/{id}`                | Includes `upcoming[]`, `paymentCount`, `membershipCount`, `permittedActions`                                                                                                                                                                                      |
| `GET /memberships`                 | Includes `counts` for the status tabs (Active includes Expiring Soon)                                                                                                                                                                                             |
| `GET /payments`                    | Includes `summary: { totalRevenue, transactions }` for administrators, `null` otherwise                                                                                                                                                                           |
| `POST /payments`                   | `201 { payment }` when recorded, `200 { payment }` for a replay of the same key and body                                                                                                                                                                          |
| `GET /plans`                       | Each plan includes `activeMemberCount` and `isReferenced`                                                                                                                                                                                                         |
| `POST /settings/logo`              | Multipart upload of the optional gym logo (validated like member photos)                                                                                                                                                                                          |
| `Accept-Language`                  | Sent on every request (`am` or `en`); `message` and `fieldErrors` are in that language, worded like the forms; dates use the Ethiopian calendar                                                                                                                   |
| Account `language`                 | `account.language` (`"am"`\|`"en"`) in `/auth/me`; saved with `PATCH /account/preferences { language }` alongside `appearance`                                                                                                                                    |

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
- **Formatting**: `f.date`, `f.money`, `f.days`, … in `src/i18n/translator.ts`, built on
  `packages/shared/src/i18n/format.ts` so the API's messages and emails read the same. Amounts show "ብር" in Amharic.

### Ethiopian calendar

Every date is shown and picked in the Ethiopian calendar, in both languages: "መስከረም 27, 2019" / "Meskerem 27, 2019"
(with "ዓ.ም" / "E.C." on headings and receipts). Times use Ethiopian time of day in Amharic ("ከቀኑ 8:20" = 14:20) and
the 24-hour clock in English.

- **Storage stays ISO.** The API, database and forms carry `YYYY-MM-DD` values; the calendar is presentation. Day
  arithmetic, sorting and "Monthly = 30 days" are therefore exact, and nothing depends on the display calendar.
- **Conversion** lives in `packages/shared/src/domain/ethiopian-calendar.ts` (13 months; Pagume has 5 days, 6 in
  leap years). A unit test compares it with ICU's Ethiopic calendar for every day from 1900 to 2100.
- **Date picker**: `src/components/ui/date-input.tsx` replaces the browser's Gregorian date input everywhere. It shows
  Ethiopian months (with Pagume), highlights today, respects min/max, and supports the keyboard (arrows, Page Up/Down
  for months, Shift for years, Home/End).
- **"This month"** (dashboard revenue, report and filter presets) is the current Ethiopian month.

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
