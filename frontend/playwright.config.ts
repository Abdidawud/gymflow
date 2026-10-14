import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** "mock" (default): in-browser mock API. "http": the real API inside the app, on a freshly seeded database. */
const API_MODE = process.env.E2E_API_MODE === "http" ? "http" : "mock";

/** Server settings for http mode (backend/.env.e2e): its database is reset and reseeded each run. */
function e2eServerEnv(): Record<string, string> {
  const file = resolve(__dirname, "../backend/.env.e2e");
  if (!existsSync(file)) throw new Error("E2E_API_MODE=http needs backend/.env.e2e (see backend/.env.e2e.example).");
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith("#")) env[match[1]] = match[2];
  }
  // `next build`/`next start` manage NODE_ENV themselves; APP_ENV tells the API it's a test.
  delete env.NODE_ENV;
  delete env.HOST;
  delete env.PORT;
  return { ...env, APP_ENV: "test", APP_ORIGIN: `http://localhost:${PORT}` };
}

/**
 * End-to-end tests run against a production build, so the critical flows are
 * verified with the real bundle, CSP and headers. By default they use the
 * in-browser mock API; E2E_API_MODE=http runs the same tests against the real
 * API served by the app itself (as on Vercel) and PostgreSQL.
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
  webServer: {
    command:
      API_MODE === "http"
        ? `npm run e2e:prepare -w @gymflow/backend && npm run build && npx next start --port ${PORT}`
        : `npm run build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI && API_MODE === "mock",
    timeout: 300_000,
    env: { NEXT_PUBLIC_API_MODE: API_MODE, ...(API_MODE === "http" ? e2eServerEnv() : {}) },
  },
});
