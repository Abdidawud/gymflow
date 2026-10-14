import { expect, test, type Page } from "@playwright/test";

/** Amharic is the default interface language; English is a per-account preference. */

const ADMIN = "abdi@adamafitness.com";

async function signInAmharic(page: Page) {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await page.locator("#login-email").fill(ADMIN);
  await page.locator("#login-password").fill("GymFlow#2026");
  await page.getByRole("button", { name: "ግባ" }).click();
  await page.waitForURL(/dashboard/);
}

test("the app opens in Amharic by default", async ({ page }) => {
  await signInAmharic(page);
  await expect(page.getByRole("heading", { level: 1, name: "ዳሽቦርድ" })).toBeVisible();
  // Ethiopian calendar: Oct 07, 2026 is Meskerem 27, 2019.
  await expect(page.getByText("ረቡዕ, መስከረም 27, 2019 ዓ.ም")).toBeVisible();
  await expect(page).toHaveTitle("ዳሽቦርድ · GymFlow");
  await expect(page.getByRole("link", { name: "አባላት" }).first()).toBeVisible();
  await page.goto("/members/00000000-0000-4000-8200-000000000126");
  await expect(page.getByText("ጊዜው ያለፈበት").first()).toBeVisible();
  await expect(page.getByText("መስከረም 20, 2019").first()).toBeVisible();
});

test("the language preference is saved to the account and follows the user", async ({ page }) => {
  await signInAmharic(page);
  await page.goto("/account");
  // The switch is instant; saving to the account happens in the background. Wait for it before reloading.
  const http = process.env.E2E_API_MODE === "http";
  const saved = http
    ? page.waitForResponse((r) => r.url().includes("/api/v1/account/preferences") && r.request().method() === "PATCH")
    : null;
  await page.locator("label", { hasText: "English" }).click();
  if (saved) await saved;
  else {
    await page.waitForFunction(() =>
      (
        JSON.parse(localStorage.getItem("gymflow:mock-db") ?? "{}") as {
          staff?: { email: string; language: string }[];
        }
      ).staff?.some((s) => s.email === "abdi@adamafitness.com" && s.language === "en"),
    );
  }
  await expect(page.getByRole("heading", { level: 1, name: "My Account" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My Account" })).toBeVisible();

  // Another device still on the default language picks up the account's choice after sign-in.
  await page.locator("#main").getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/login/);
  await page.evaluate(() => localStorage.setItem("gymflow-locale", "am"));
  await signInAmharic(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("errors from the API follow the chosen language", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(ADMIN);
  await page.locator("#login-password").fill("not-the-password");
  await page.getByRole("button", { name: "ግባ" }).click();
  await expect(page.getByText("ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።")).toBeVisible();
});
