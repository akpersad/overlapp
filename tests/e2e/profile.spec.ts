import { expect, test } from "@playwright/test";

import {
  createGroupViaUI,
  seedMembership,
  seedUser,
  serviceClient,
  signUpNewUser,
} from "./_helpers";

// A 1×1 PNG — smallest valid image for the avatar upload path.
const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Profile", () => {
  test("edit name, upload and remove an avatar", async ({ page }) => {
    await signUpNewUser(page, { first: "Pia", last: "Profile" });
    await page.goto("/profile");

    // Edit profile fields.
    await page.fill("#display_name", "Pia P.");
    await page.fill("#time_zone", "America/New_York");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/saved ✓/i).first()).toBeVisible();

    // Upload an avatar, then remove it.
    await page.setInputFiles('input[name="avatar"]', {
      name: "avatar.png",
      mimeType: "image/png",
      buffer: ONE_PX_PNG,
    });
    await page.getByRole("button", { name: /^upload$/i }).click();
    await expect(page.getByText(/saved ✓/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^remove$/i }).click();
    await expect(page.getByRole("button", { name: /^remove$/i })).toHaveCount(0);

    // The notifications section (push opt-in) renders.
    await expect(page.getByRole("heading", { name: /^notifications$/i })).toBeVisible();
  });

  test("account deletion offers transfer for a co-owned group", async ({
    page,
  }) => {
    const svc = serviceClient();
    await signUpNewUser(page, { first: "Della", last: "Delete" });
    const { groupId } = await createGroupViaUI(page, "Game Night");
    const other = await seedUser(svc, { first: "Cory", last: "Comember" });
    await seedMembership(svc, groupId, other.id, "member");

    await page.goto("/profile");
    await page.getByRole("button", { name: /delete account/i }).click();
    await expect(page.getByText(/permanently deletes your account/i)).toBeVisible();
    // A transfer dropdown appears because the owned group has another member.
    await expect(page.locator('select[name^="transfer:"]')).toBeVisible();
    // Back out — we don't actually delete here.
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("button", { name: /delete account/i })).toBeVisible();
  });
});
