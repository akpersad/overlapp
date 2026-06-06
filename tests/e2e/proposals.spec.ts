import { expect, test } from "@playwright/test";

import { createGroupViaUI, offsetISODate, signUpNewUser } from "./_helpers";

// Multi-date proposals (Phase 3): seed candidate slots → RSVP → results overlap
// → proposer locks the final slot. Plus the cancel path.

async function startProposal(page: import("@playwright/test").Page) {
  await signUpNewUser(page, { first: "Prop", last: "Oser" });
  const { groupId } = await createGroupViaUI(page, "Supper Club");
  await page.goto(`/groups/${groupId}/proposals/new`);
  await expect(page.getByRole("heading", { name: /propose a time/i })).toBeVisible();
  return groupId;
}

test("create a proposal, RSVP, and lock the final slot", async ({ page }) => {
  await startProposal(page);

  await page.fill("#title", "Dinner");
  // Option 1 (date inputs are controlled; times default to 18:00–19:00).
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(offsetISODate(3));
  // Option 2.
  await page.getByRole("button", { name: /add another time/i }).click();
  await dateInputs.nth(1).fill(offsetISODate(4));

  await page.getByRole("button", { name: /send proposal/i }).click();
  await page.waitForURL(/\/proposals\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Dinner" })).toBeVisible();

  // RSVP "Yes" to every candidate, then save.
  const yes = page.getByRole("button", { name: "Yes", exact: true });
  const count = await yes.count();
  for (let i = 0; i < count; i++) await yes.nth(i).click();
  await page.getByRole("button", { name: /save my response/i }).click();
  await expect(
    page.getByRole("button", { name: /update my response/i }),
  ).toBeVisible();

  // Overlap tally reflects the response, then lock the first candidate.
  await expect(page.getByText(/responded/i)).toBeVisible();
  await page.getByRole("button", { name: /lock this/i }).first().click();
  await expect(page.getByText(/✓ Locked/)).toBeVisible();
  await expect(page.getByText("Chosen")).toBeVisible();
});

test("cancel a proposal", async ({ page }) => {
  await startProposal(page);

  await page.fill("#title", "Maybe brunch");
  await page.locator('input[type="date"]').nth(0).fill(offsetISODate(5));
  await page.getByRole("button", { name: /send proposal/i }).click();
  await page.waitForURL(/\/proposals\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: /cancel proposal/i }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
});
