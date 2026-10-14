import { expect, test, type Page } from "@playwright/test";

/**
 * Critical Version 1 flows (design.md §23 acceptance checklist), run against
 * the demo data with the frozen design date Oct 07, 2026 = Meskerem 27, 2019 E.C.
 * Dates on screen are in the Ethiopian calendar.
 */

async function signIn(page: Page, email: string, password = "GymFlow#2026") {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

/** Demo member URL by member code (fixed demo UUIDs, see packages/shared/src/demo/ids.ts). */
const member = (code: number) => `/members/00000000-0000-4000-8200-${String(code).padStart(12, "0")}`;

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

test("active renewal continues without gaps (Tekemt 21 – Hedar 20) and records once on retry", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto(member(124));
  await page.getByRole("button", { name: "Renew Membership" }).first().click();

  const drawer = page.getByRole("dialog");
  await drawer.getByText("Monthly", { exact: true }).click();
  const preview = drawer.locator("section[aria-labelledby=payment-preview-heading]");
  // Oct 31 – Nov 29, 2026 in the Ethiopian calendar.
  await expect(preview).toContainText("Tekemt 21, 2019");
  await expect(preview).toContainText("Hedar 20, 2019");

  await drawer.getByText("Bank Transfer", { exact: true }).click();
  await drawer.getByRole("button", { name: /Confirm Payment/ }).click();
  await expect(drawer.getByText("Enter the transaction reference for this payment method.")).toBeVisible();
  await drawer.getByLabel("Transaction Reference").fill("FT2628012345");

  // Simulate a response lost after the server recorded the payment.
  const http = process.env.E2E_API_MODE === "http";
  const count = http
    ? () =>
        page.evaluate(() =>
          fetch("/api/v1/payments?pageSize=1", { credentials: "include" })
            .then((r) => r.json())
            .then((d: { total: number }) => d.total),
        )
    : () => page.evaluate(() => JSON.parse(localStorage.getItem("gymflow:mock-db") ?? "{}").payments.length);
  const before = await count();
  if (http) {
    await page.route(
      "**/api/v1/payments",
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await route.fetch(); // the server commits the payment…
        await route.abort("connectionreset"); // …but the browser never sees the answer
      },
      { times: 1 },
    );
  } else {
    await page.evaluate(() => {
      window.__gymflowMock!.failNextPayment = "after-commit";
    });
  }
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
  await page.goto(member(126));
  await expect(page.getByText("Membership expired on Meskerem 20, 2019")).toBeVisible();
  await page.goto(member(127));
  await expect(page.getByText("No paid membership yet")).toBeVisible();
  await page.getByRole("button", { name: "Record First Payment" }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Weekly", { exact: true }).click();
  const start = drawer.getByRole("button", { name: /Membership Start/ });
  await expect(start).toHaveAttribute("data-value", "2026-10-07");
  await expect(start).toContainText("Meskerem 27, 2019");

  // Reschedule with the Ethiopian date picker: next month, Tekemt 2 (Oct 12, 2026).
  await start.click();
  const calendar = page.getByRole("dialog", { name: "Calendar" });
  await calendar.getByRole("button", { name: "Next month" }).click();
  await calendar.getByRole("button", { name: "Monday, Tekemt 2, 2019" }).click();
  await expect(start).toHaveAttribute("data-value", "2026-10-12");
  const preview = drawer.locator("section[aria-labelledby=payment-preview-heading]");
  await expect(preview).toContainText("Tekemt 8, 2019");

  // A member who joined before GymFlow: back to last month, Meskerem 10 (Sep 20, 2026).
  await start.click();
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await calendar.getByRole("button", { name: "Sunday, Meskerem 10, 2019" }).click();
  await expect(start).toHaveAttribute("data-value", "2026-09-20");
  // The payment date follows the backdated start until it is changed by hand.
  await expect(drawer.getByRole("button", { name: /Payment Date/ })).toHaveAttribute("data-value", "2026-09-20");
  await expect(preview).toContainText("Meskerem 16, 2019");
});

test("scheduled member is never presented as valid", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.goto(member(128));
  await expect(page.getByText("Membership starts on Tekemt 2, 2019")).toBeVisible();
  await expect(page.getByText("Scheduled · Starts Tek 2").first()).toBeVisible();
});

test("member lookup finds by phone and opens the profile", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.waitForURL(/dashboard/);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search members by name, phone or ID…").last().fill("0922 456");
  await expect(page.getByRole("option", { name: /Hana Tesfaye/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(member(125)));
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
