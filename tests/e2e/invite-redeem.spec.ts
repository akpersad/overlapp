import { expect, test } from "@playwright/test";

import {
  createGroupViaUI,
  profileIdByEmail,
  seedInvite,
  serviceClient,
  signUpNewUser,
  uniqueEmail,
} from "./_helpers";

// The full share-link redemption bridge: an invitee with no account opens the
// public preview, signs up via the redirectTo link, and is auto-joined by the
// register_invite_signup → handle_new_user path (CLAUDE.md onboarding/invite fix).

test("invitee signs up from a share link and is auto-joined", async ({
  page,
  browser,
}) => {
  const svc = serviceClient();

  // User A creates the group and a share-link token.
  const a = await signUpNewUser(page, { first: "Hosti", last: "Host" });
  const { groupId } = await createGroupViaUI(page, "Trivia Night");
  const aId = await profileIdByEmail(svc, a.email);
  const token = await seedInvite(svc, groupId, aId);

  // User B (a fresh browser, signed out) opens the preview.
  const guestCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestCtx.newPage();
  await guest.goto(`/invite/${token}`);
  // Scope to the heading — the invite <title> metadata also holds the group name.
  await expect(
    guest.getByRole("heading", { name: "Trivia Night" }),
  ).toBeVisible();
  await expect(
    guest.getByRole("link", { name: /sign up to join/i }),
  ).toBeVisible();

  // Sign up from the invite — the redirectTo carries the token through.
  await guest.getByRole("link", { name: /sign up to join/i }).click();
  await guest.waitForURL("**/signup**");
  const bEmail = uniqueEmail("invitee");
  await guest.fill("#first_name", "Gwaine");
  await guest.fill("#last_name", "Guest");
  await guest.fill("#email", bEmail);
  await guest.fill("#password", "e2e-password-123!");
  await guest.getByRole("button", { name: /create account/i }).click();

  // Back on the invite page, already auto-joined: the count now reads 2 members
  // (proves the bridge ran before any click), and joining is idempotent.
  await guest.waitForURL(`**/invite/${token}`);
  await expect(guest.getByText(/2 members/i)).toBeVisible();
  await guest.getByRole("button", { name: /join group/i }).click();
  await guest.waitForURL(/\/groups\/[0-9a-f-]+$/);
  await expect(
    guest.getByRole("heading", { name: "Trivia Night" }),
  ).toBeVisible();
  await guestCtx.close();

  // User A now sees two members.
  await page.goto(`/groups/${groupId}`);
  await expect(page.getByText(/Members \(2\)/)).toBeVisible();
});
