import { expect, test } from "@playwright/test";

import { loginViaUI, seedUser, serviceClient, uniqueEmail } from "./_helpers";

// Auth-recovery edges: forgot/reset password, resend verification, and the
// branded 404. The emailed recovery/confirmation links themselves are a manual
// check (local GoTrue has confirmations off) — here we drive the deterministic
// request/landing UI the suite *can* cover (TESTING.md → Manual pre-launch checks).

test.describe("Auth recovery", () => {
  test("login links to forgot-password and a request is confirmed", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.waitForURL("**/forgot-password");

    await page.fill("#email", uniqueEmail("forgot"));
    await page.getByRole("button", { name: /send reset link/i }).click();

    // Always-success message (no user enumeration), regardless of the address.
    await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
  });

  test("reset-password without a recovery session shows an expired notice", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /link expired/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /request a new link/i })).toBeVisible();
  });

  test("verify-email offers a working resend affordance", async ({ page }) => {
    await page.goto(`/verify-email?email=${encodeURIComponent("someone@overlapp.test")}`);
    await page.getByRole("button", { name: /resend confirmation email/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible();
  });

  test("an unknown URL renders the branded 404 (signed in)", async ({ page }) => {
    const user = await seedUser(serviceClient(), { first: "Not", last: "Found" });
    await loginViaUI(page, user.email);

    await page.goto("/definitely-not-a-real-page");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /go to your dashboard/i })).toBeVisible();
  });
});
