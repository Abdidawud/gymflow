# GymFlow

Staff-facing gym membership and payment management for a single gym (Adama Fitness, ETB, Africa/Addis_Ababa).
The interface is bilingual: **Amharic (default) and English**.

| Path                                                                                   | Contents                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`frontend/`](frontend/)                                                               | Next.js 16 + Tailwind CSS 4 web app (runs on an in-browser mock backend) |
| [`stitch_design_system_generator/design.md`](stitch_design_system_generator/design.md) | Product and UI specification (Version 1)                                 |
| [`stitch_design_system_generator/`](stitch_design_system_generator/)                   | Visual design system and screen mockups                                  |
| [`backend-database-system-design.md`](backend-database-system-design.md)               | Backend, database and API design (`/api/v1`)                             |

## Run the frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000 — demo admin: abdi@adamafitness.com / GymFlow#2026
```

See [`frontend/README.md`](frontend/README.md) for configuration, architecture, languages and the backend contract.

## Status

- Frontend: complete for Version 1, running against a mock API with demo data.
- Backend: next.
