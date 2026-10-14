import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const SECRET = "a-production-session-secret-of-32-chars";

/** What Vercel (with the Neon integration) provides to a production deployment. */
const vercelProduction = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "gymflow-abc123.vercel.app",
  VERCEL_BRANCH_URL: "gymflow-git-main.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "gymflow.vercel.app",
  DATABASE_URL: "postgres://app:pw@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  DATABASE_URL_UNPOOLED: "postgres://owner:pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  SESSION_SECRET: SECRET,
};

describe("configuration on Vercel", () => {
  it("derives the origin, secure cookies and connections from Vercel's variables", () => {
    const config = loadConfig(vercelProduction);
    expect(config).toMatchObject({
      isProduction: true,
      onVercel: true,
      appOrigin: "https://gymflow.vercel.app",
      cookieSecure: true,
      mail: { transport: "disabled" },
      database: { url: vercelProduction.DATABASE_URL, migrationUrl: vercelProduction.DATABASE_URL_UNPOOLED, poolMax: 5 },
    });
    expect(config.allowedOrigins).toEqual([
      "https://gymflow.vercel.app",
      "https://gymflow-abc123.vercel.app",
      "https://gymflow-git-main.vercel.app",
    ]);
  });

  it("uses SMTP when configured and prefers GYMFLOW_DATABASE_URL", () => {
    const config = loadConfig({
      ...vercelProduction,
      SMTP_URL: "smtps://u:p@smtp.example.com:465",
      GYMFLOW_DATABASE_URL: "postgres://gymflow_app:pw@ep-x-pooler/neondb",
      APP_ORIGIN: "https://gym.example.et",
    });
    expect(config.mail.transport).toBe("smtp");
    expect(config.database.url).toBe("postgres://gymflow_app:pw@ep-x-pooler/neondb");
    expect(config.appOrigin).toBe("https://gym.example.et");
  });

  it("refuses development shortcuts in production", () => {
    expect(() => loadConfig({ ...vercelProduction, FIXED_TODAY: "2026-10-07" })).toThrow(/FIXED_TODAY/);
    expect(() => loadConfig({ ...vercelProduction, MAIL_TRANSPORT: "log" })).toThrow(/MAIL_TRANSPORT=log/);
    expect(() => loadConfig({ ...vercelProduction, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("lets tests run under `next start` with APP_ENV=test", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      APP_ENV: "test",
      DATABASE_URL: "postgres://x",
      APP_ORIGIN: "http://localhost:3100",
      SESSION_SECRET: SECRET,
      FIXED_TODAY: "2026-10-07",
    });
    expect(config).toMatchObject({ isProduction: false, cookieSecure: false, fixedToday: "2026-10-07" });
  });
});
