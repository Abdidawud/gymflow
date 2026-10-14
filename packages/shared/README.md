# @gymflow/shared

Code used by both the web app (`frontend/`) and the API (`backend/`), so the two always agree:

| Path                                                                                             | Contents                                                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/api/types.ts`, `src/api/errors.ts`                                                          | The `/api/v1` contract: request/response types and stable error codes                               |
| `src/domain/membership.ts`                                                                       | Membership status, continuous coverage, renewal start dates, overlap checks                         |
| `src/domain/ethiopian-calendar.ts`                                                               | Ethiopian ⇄ ISO date conversion, month boundaries, Ethiopian time of day                            |
| `src/domain/dates.ts`, `money.ts`, `phone.ts`, `password.ts`, `permissions.ts`, `member-list.ts` | Date arithmetic, exact ETB money, Ethiopian phone numbers, password policy, roles, list search/sort |
| `src/i18n/`                                                                                      | Supported languages and Ethiopian date/time formatting in Amharic and English                       |
| `src/demo/`                                                                                      | The deterministic demo gym used by the in-browser mock and the database seed                        |

Pure TypeScript with no runtime dependencies; consumers compile it (Next.js transpiles workspace packages, the API
bundles it with tsup). `npm test` runs the unit tests, including a day-by-day check of the Ethiopian calendar
against ICU from 1900 to 2100.
