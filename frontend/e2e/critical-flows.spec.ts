import { expect, test, type Page } from "@playwright/test";

/**
 * Critical Version 1 flows (design.md §23 acceptance checklist), run against
 * the mock API with the frozen design date Oct 07, 2026.
 */

async function signIn(page: Page, email: string, password = "GymFlow#2026") {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

const ADMIN = "abdi@adamafitness.com";
const RECEPTIONIST = "tigist@adamafitness.com";

// These flows assert English copy, so pick English as if on the sign-in screen.
// Amharic, the default language, is covered in amharic.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gymflow-locale", "en");
    sessionStorage.setItem("gymflow-locale-chosen", "1");
  });
});

test("invalid credentials show a generic error", async ({ page }) => {
  await signIn(page, ADMIN, "not-the-password");
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("dashboard counts reconcile and expose admin revenue", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText("Includes 20 expiring soon")).toBeVisible();
  await expect(page.getByText("Today's Revenue")).toBeVisible();
  await expect(page.getByRole("group", { name: /Daily revenue/ })).toBeVisible();
});

test("active renewal continues without gaps (Oct 31 – Nov 29) and records once on retry", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto("/members/mem_00124");
  await page.getByRole("button", { name: "Renew Membership" }).first().click();

  const drawer = page.getByRole("dialog");
  await drawer.getByText("Monthly", { exact: true }).click();
  const preview = drawer.locator("section[aria-labelledby=payment-preview-heading]");
  await expect(preview).toContainText("Oct 31, 2026");
  await expect(preview).toContainText("Nov 29, 2026");

  await drawer.getByText("Bank Transfer", { exact: true }).click();
  await drawer.getByRole("button", { name: /Confirm Payment/ }).click();
  await expect(drawer.getByText("Enter the transaction reference for this payment method.")).toBeVisible();
  await drawer.getByLabel("Transaction Reference").fill("FT2628012345");

  const count = () => page.evaluate(() => JSON.parse(localStorage.getItem("gymflow:mock-db") ?? "{}").payments.length);
  const before = await count();
  await page.evaluate(() => {
    window.__gymflowMock!.failNextPayment = "after-commit";
  });
  await drawer.getByRole("button", { name: /Confirm Payment/ }).click();
  await expect(drawer.getByText("We couldn't confirm whether this payment was recorded")).toBeVisible();
  await drawer.getByRole("button", { name: "Check again" }).click();
  await expect(drawer.getByText("Payment recorded successfully.")).toBeVisible();
  expect(await count()).toBe(before + 1);

  await drawer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Scheduled periods")).toBeVisible();
});

test("expired and unpaid purchases start today and can be rescheduled", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto("/members/mem_00126");
  await expect(page.getByText("Membership expired on Sep 30, 2026")).toBeVisible();
  await page.goto("/members/mem_00127");
  await expect(page.getByText("No paid membership yet")).toBeVisible();
  await page.getByRole("button", { name: "Record First Payment" }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Weekly", { exact: true }).click();
  await expect(drawer.getByLabel("Membership Start")).toHaveValue("2026-10-07");
});

test("scheduled member is never presented as valid", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto("/members/mem_00128");
  await expect(page.getByText("Membership starts on Oct 12, 2026")).toBeVisible();
  await expect(page.getByText("Scheduled · Starts Oct 12").first()).toBeVisible();
});

test("member lookup finds by phone and opens the profile", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search members by name, phone or ID…").last().fill("0922 456");
  await expect(page.getByRole("option", { name: /Hana Tesfaye/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/members\/mem_00125/);
});

test("registration validates fields and warns about a duplicate phone", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto("/members/new");
  await page.getByLabel("Phone Number").fill("+251 911 234 567");
  await page.getByLabel("Phone Number").blur();
  await expect(page.getByRole("link", { name: "Open existing record" })).toBeVisible();
  await page.getByRole("button", { name: "Save Member" }).first().click();
  await expect(page.getByText("Enter the first name.").first()).toBeVisible();
});

test("receptionist cannot see administrator features", async ({ page }) => {
  await signIn(page, RECEPTIONIST);
  await page.waitForURL(/dashboard/);
  await expect(page.getByText("Administration", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Today's Revenue")).toHaveCount(0);
  await page.goto("/reports");
  await expect(page.getByText("You don't have permission to view this page")).toBeVisible();
});

test("temporary password forces a password change", async ({ page }) => {
  await signIn(page, "selam@adamafitness.com", "Welcome#2026");
  await expect(page).toHaveURL(/change-password/);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
});

test("mobile shows member cards and a full-screen payment dialog @mobile", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto("/members");
  await expect(page.getByRole("button", { name: "Renew Membership" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Renew Membership" }).first().click();
  const drawer = page.getByRole("dialog");
  const box = await drawer.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) - 1);
});
