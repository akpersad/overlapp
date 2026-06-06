import { expect, test } from "@playwright/test";

import {
  createGroupViaUI,
  profileIdByEmail,
  seedGroup,
  seedMembership,
  seedUser,
  serviceClient,
  signUpNewUser,
} from "./_helpers";

// Group lifecycle from the owner and member sides: edit settings, manage roles,
// remove a member, dissolve, and (separately) leave a group you don't own.

test("owner edits settings, manages a member, and dissolves the group", async ({
  page,
}) => {
  const svc = serviceClient();
  await signUpNewUser(page, { first: "Olive", last: "Owner" });
  const { groupId } = await createGroupViaUI(page, "Book Club");

  // Edit settings and confirm they stick.
  await page.goto(`/groups/${groupId}/edit`);
  await page.fill("#name", "Book Club Deluxe");
  await page.selectOption("#slot_minutes", "60");
  await page.selectOption("#join_policy", "approval");
  await page.fill("#quorum", "2");
  // The save is a server-action POST (no navigation); wait for it to finish
  // before navigating away, or the request gets cancelled and the edit is lost.
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.status() < 400,
    ),
    page.getByRole("button", { name: /save changes/i }).click(),
  ]);
  await page.goto(`/groups/${groupId}`);
  await expect(
    page.getByRole("heading", { name: "Book Club Deluxe" }),
  ).toBeVisible();

  // Seed a second member, then promote and remove them.
  const member = await seedUser(svc, { first: "Mara", last: "Member" });
  await seedMembership(svc, groupId, member.id, "member");
  await page.reload();
  await expect(page.getByText(/Members \(2\)/)).toBeVisible();

  await page.getByRole("button", { name: /^make admin$/i }).click();
  await expect(page.getByRole("button", { name: /^remove admin$/i })).toBeVisible();
  await page.getByRole("button", { name: /^remove$/i }).click();
  await expect(page.getByText(/Members \(1\)/)).toBeVisible();

  // Dissolve the group — it disappears from the dashboard.
  await page.getByRole("button", { name: /dissolve group/i }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Book Club Deluxe")).toHaveCount(0);
});

test("a member can leave a group they don't own", async ({ page }) => {
  const svc = serviceClient();
  const me = await signUpNewUser(page, { first: "Lee", last: "Leaver" });
  const myId = await profileIdByEmail(svc, me.email);

  // Someone else owns a group; I'm just a member.
  const owner = await seedUser(svc, { first: "Otto", last: "Owner" });
  const groupId = await seedGroup(svc, owner.id, "Hiking Crew");
  await seedMembership(svc, groupId, myId, "member");

  await page.goto(`/groups/${groupId}`);
  await expect(page.getByRole("heading", { name: "Hiking Crew" })).toBeVisible();
  await page.getByRole("button", { name: /leave group/i }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Hiking Crew")).toHaveCount(0);
});
