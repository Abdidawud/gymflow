# GymFlow

Staff-facing gym membership and payment management for a single gym (ETB, Africa/Addis_Ababa). The interface is
bilingual — **Amharic (default) and English** — and every date is shown and picked in the **Ethiopian calendar**
(Meskerem 27, 2019 E.C.), with Ethiopian time of day in Amharic.

| Path                                                                                   | Contents                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`frontend/`](frontend/)                                                               | Next.js 16 web app — also serves the API at `/api/v1`                       |
| [`backend/`](backend/)                                                                 | The API (Fastify 5) and PostgreSQL schema, migrations and CLI               |
| [`packages/shared/`](packages/shared/)                                                 | Business rules, API contract, Ethiopian calendar and demo data used by both |
| [`scripts/`](scripts/)                                                                 | Vercel build, local PostgreSQL helper, backup and restore                   |
| [`stitch_design_system_generator/design.md`](stitch_design_system_generator/design.md) | Product and UI specification (Version 1)                                    |
| [`backend-database-system-design.md`](backend-database-system-design.md)               | Backend, database and API design                                            |

One deployable app: the web app hosts the API in a route handler (`frontend/src/app/api/v1/[...path]/route.ts`), so
the site and the API share one origin. The API can also run as a standalone server (`backend/`).

## Run it locally

```bash
npm install                                  # once, at the repo root (npm workspaces)
cp frontend/.env.example frontend/.env.local # database URL, SESSION_SECRET … (see backend/README.md to set up PostgreSQL)
npm run migrate -w backend                   # create or update the schema
npm run dev                                  # http://localhost:3000 — web app and API
```

Without a database, `NEXT_PUBLIC_API_MODE=mock npm run dev` runs a demo on an in-browser mock API.

Accounts are created by administrators; the first one (the **super administrator**, who can't be demoted or
deactivated by anyone else) is created from the command line:

```bash
npm run admin:create -w backend -- --email you@example.com --name "Your Name" --super
```

## Deploy to Vercel

See [Deploying to Vercel](backend/README.md#deploying-to-vercel): one Vercel project (root directory `frontend`), a
Neon PostgreSQL database from the Vercel Marketplace, a few environment variables, then `admin:create --super`.

## Checks

```bash
npm run check                                            # typecheck, lint and unit/integration tests (all packages)
cd frontend && npx playwright test                       # end-to-end, mock API
cd frontend && E2E_API_MODE=http npx playwright test     # end-to-end against the real API and PostgreSQL
```
