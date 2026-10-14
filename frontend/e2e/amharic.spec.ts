import { expect, test, type Page } from "@playwright/test";

/**
 * English is the default interface language; Amharic is chosen on the sign-in
 * screen or in My Account, saved to the staff account and applied on any device.
 * Each test changes a different account's language, so they can run in parallel.
 */

const PASSWORD = "GymFlow#2026";

async function signIn(page: Page, email: string, button: string) {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: button }).click();
  await page.waitForURL(/dashboard/);
}

async function chooseOnSignIn(page: Page, language: "አማርኛ" | "English") {
  await page.getByRole("button", { name: /Change language|ቋንቋ ቀይር/ }).click();
  await page.getByRole("menuitem", { name: language }).click();
}

test("the app opens in English, and Amharic can be chosen on the sign-in screen", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  await chooseOnSignIn(page, "አማርኛ");
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await signIn(page, "tigist@adamafitness.com", "ግባ");

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
  await page.goto("/login");
  await signIn(page, "abdi@adamafitness.com", "Sign In");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/account");

  // The switch is instant; saving to the account happens in the background. Wait for it before reloading.
  const http = process.env.E2E_API_MODE === "http";
  const saved = http
    ? page.waitForResponse((r) => r.url().includes("/api/v1/account/preferences") && r.request().method() === "PATCH")
    : null;
  await page.locator("label", { hasText: "አማርኛ" }).click();
  if (saved) await saved;
  else {
    await page.waitForFunction(() =>
      (
        JSON.parse(localStorage.getItem("gymflow:mock-db") ?? "{}") as {
          staff?: { email: string; language: string }[];
        }
      ).staff?.some((s) => s.email === "abdi@adamafitness.com" && s.language === "am"),
    );
  }
  await expect(page.getByRole("heading", { level: 1, name: "የእኔ መለያ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "የእኔ መለያ" })).toBeVisible();

  // Another device still on the default (English) picks up the account's choice after sign-in.
  await page.locator("#main").getByRole("button", { name: "ውጣ" }).click();
  await page.waitForURL(/login/);
  await page.evaluate(() => localStorage.setItem("gymflow-locale", "en"));
  await page.reload();
  await signIn(page, "abdi@adamafitness.com", "Sign In");
  await expect(page.getByRole("heading", { level: 1, name: "ዳሽቦርድ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
});

test("errors from the API follow the chosen language", async ({ page }) => {
  await page.goto("/login");
  await chooseOnSignIn(page, "አማርኛ");
  await page.locator("#login-email").fill("abdi@adamafitness.com");
  await page.locator("#login-password").fill("not-the-password");
  await page.getByRole("button", { name: "ግባ" }).click();
  await expect(page.getByText("ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።")).toBeVisible();
});
