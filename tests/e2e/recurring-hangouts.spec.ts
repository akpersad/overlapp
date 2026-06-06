import { expect, test } from "@playwright/test";

import { createGroupViaUI, offsetISODate, signUpNewUser } from "./_helpers";

// Recurring hangouts (Phase 4): an admin sets up a standing get-together, sees
// the next occurrence, and "Propose this" pre-seeds the proposal form.

test("create a recurring hangout and propose from it", async ({ page }) => {
  await signUpNewUser(page, { first: "Reggie", last: "Recur" });
  const { groupId } = await createGroupViaUI(page, "Friends");

  await page.goto(`/groups/${groupId}`);
  await page.getByRole("button", { name: /add a recurring hangout/i }).click();

  await page.fill("#hangout_title", "Game Night");
  await page.fill("#hangout_date", offsetISODate(1));
  // Daily avoids weekday-matching arithmetic while still yielding an occurrence.
  await page.getByRole("button", { name: /^daily$/i }).click();
  await page.getByRole("button", { name: /save hangout/i }).click();

  // The hangout lands in the list with an upcoming occurrence + "Propose this".
  await expect(page.getByText("Game Night")).toBeVisible();
  const proposeThis = page.getByRole("link", { name: /propose this/i });
  await expect(proposeThis).toBeVisible();

  // "Propose this" pre-seeds the proposal form (title + first candidate date).
  await proposeThis.click();
  await page.waitForURL(/\/proposals\/new\?/);
  await expect(page.locator("#title")).toHaveValue("Game Night");
  await expect(page.locator('input[type="date"]').nth(0)).not.toHaveValue("");
});
