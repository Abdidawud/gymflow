import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** "mock" (default): in-browser mock API. "http": the real API and a freshly seeded PostgreSQL database. */
const API_MODE = process.env.E2E_API_MODE === "http" ? "http" : "mock";
const API_PORT = 4100;

/**
 * End-to-end tests run against a production build, so the critical flows are
 * verified with the real bundle, CSP and headers. By default they use the
 * in-browser mock API; E2E_API_MODE=http runs the same tests against the real
 * backend (backend/.env.e2e: its database is reset and seeded with the demo gym).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "Africa/Addis_Ababa",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    ...(API_MODE === "http"
      ? [
          {
            command: "npm run e2e:serve",
            cwd: "../backend",
            url: `http://127.0.0.1:${API_PORT}/api/v1/ready`,
            reuseExistingServer: false,
            timeout: 120_000,
            stdout: "pipe" as const,
          },
        ]
      : []),
    {
      command: `npm run build && npx next start --port ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI && API_MODE === "mock",
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_API_MODE: API_MODE,
        ...(API_MODE === "http" ? { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` } : {}),
      },
    },
  ],
});
