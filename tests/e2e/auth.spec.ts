import { expect, test } from "@playwright/test";

import { loginViaUI, seedUser, serviceClient, signUpNewUser } from "./_helpers";

// Auth surface: gating, bad-credential handling, and the full
// sign-up → sign-out → sign-in round trip.

test.describe("Auth", () => {
  test("signed-out app routes redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    const user = await seedUser(serviceClient(), { first: "Wrong", last: "Pass" });
    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", "definitely-not-the-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign up, sign out, then sign back in", async ({ page }) => {
    const { email } = await signUpNewUser(page, { first: "Otto", last: "Auth" });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/profile");
    await page.getByRole("button", { name: /^sign out$/i }).click();
    await page.waitForURL("**/login**");

    await loginViaUI(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
