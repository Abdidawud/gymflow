# GymFlow

Staff-facing gym membership and payment management for a single gym (Adama Fitness, ETB, Africa/Addis_Ababa).
The interface is bilingual — **Amharic (default) and English** — and every date is shown and picked in the
**Ethiopian calendar** (Meskerem 27, 2019 E.C.), with Ethiopian time of day in Amharic.

| Path                                                                                   | Contents                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`frontend/`](frontend/)                                                               | Next.js 16 + Tailwind CSS 4 web app                                         |
| [`backend/`](backend/)                                                                 | Fastify 5 API (`/api/v1`) on PostgreSQL 18                                  |
| [`packages/shared/`](packages/shared/)                                                 | Business rules, API contract, Ethiopian calendar and demo data used by both |
| [`scripts/`](scripts/)                                                                 | `npm run dev` runner, local PostgreSQL helper, backup and restore           |
| [`stitch_design_system_generator/design.md`](stitch_design_system_generator/design.md) | Product and UI specification (Version 1)                                    |
| [`stitch_design_system_generator/`](stitch_design_system_generator/)                   | Visual design system and screen mockups                                     |
| [`backend-database-system-design.md`](backend-database-system-design.md)               | Backend, database and API design                                            |

## Run it

```bash
npm install                      # once, at the repo root (npm workspaces)

# Full stack: API + PostgreSQL + web app (see backend/README.md to set up the database once)
npm run dev                      # web http://localhost:3000, API http://127.0.0.1:4000/api/v1

# Or the web app alone, on an in-browser mock API with the same demo data
npm run dev -w frontend
```

Demo administrator: `abdi@adamafitness.com` / `GymFlow#2026` (the demo date is frozen at Meskerem 27, 2019 E.C.).

## Checks

```bash
npm run check                                            # typecheck, lint and unit/integration tests (all packages)
cd frontend && npx playwright test                       # end-to-end, mock API
cd frontend && E2E_API_MODE=http npx playwright test     # end-to-end against the real API and database
```

See [`backend/README.md`](backend/README.md) (setup, security, deployment, backups) and
[`frontend/README.md`](frontend/README.md) (architecture, languages, calendar).
