import { expect, test } from "@playwright/test";

import { profileIdByEmail, serviceClient, signUpNewUser } from "./_helpers";

// Notifications inbox: an unread item surfaces, "Mark all read" clears the
// unread state, and dismissing the last item shows the empty state.

test("inbox shows, marks read, and dismisses notifications", async ({ page }) => {
  const svc = serviceClient();
  const me = await signUpNewUser(page, { first: "Nora", last: "Notify" });
  const myId = await profileIdByEmail(svc, me.email);

  const { error } = await svc.from("notifications").insert({
    user_id: myId,
    kind: "proposal_new",
    title: "New proposal: Dinner",
    body: "Mark your availability",
  });
  if (error) throw error;

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: /^inbox$/i })).toBeVisible();
  await expect(page.getByText("New proposal: Dinner")).toBeVisible();

  // Unread → "Mark all read" is offered; clicking clears it.
  const markAll = page.getByRole("button", { name: /mark all read/i });
  await expect(markAll).toBeVisible();
  await markAll.click();
  await expect(markAll).toHaveCount(0);

  // Dismiss the (now read) item → empty state.
  await page.getByRole("button", { name: "✕" }).click();
  await expect(page.getByText(/nothing here yet/i)).toBeVisible();
});
