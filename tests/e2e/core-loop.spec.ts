import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { localSupabase } from "./_creds";

// Drives the Phase 1 core loop end-to-end as a real user and screenshots every
// screen for visual review. Screenshots go to ./screenshots (gitignored) and
// are reviewed + deleted per docs/TESTING.md — never committed.

const { url, serviceKey } = localSupabase();
const svc = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const email = `e2e-${stamp}@overlapp.test`;
const password = "e2e-password-123!";

function todayISODate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

test("Phase 1 core loop: signup → group → availability → heatmap → invite", async ({
  page,
  browser,
}) => {
  // 1. Landing
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: "screenshots/01-landing.png", fullPage: true });

  // 2. Sign up
  await page.getByRole("link", { name: /get started/i }).click();
  await page.waitForURL("**/signup");
  await page.fill("#first_name", "Ada");
  await page.fill("#last_name", "Lovelace");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.screenshot({ path: "screenshots/02-signup.png", fullPage: true });
  await page.getByRole("button", { name: /create account/i }).click();

  // 3. Onboarding
  await page.waitForURL("**/onboarding");
  await expect(page.getByText(/welcome to overlapp/i)).toBeVisible();
  await page.screenshot({ path: "screenshots/03-onboarding.png", fullPage: true });
  await page.getByRole("button", { name: /get started/i }).click();

  // 4. Dashboard (empty)
  await page.waitForURL("**/dashboard");
  await expect(page.getByText(/not in any groups yet/i)).toBeVisible();
  await page.screenshot({ path: "screenshots/04-dashboard-empty.png", fullPage: true });

  // 5. Create a group
  await page.getByRole("link", { name: /new group/i }).first().click();
  await page.waitForURL("**/groups/new");
  await page.fill("#name", "Climbing Buddies");
  await page.fill("#description", "Weekend sends");
  await page.screenshot({ path: "screenshots/05-create-group.png", fullPage: true });
  await page.getByRole("button", { name: /create group/i }).click();

  // 6. Group detail
  await page.waitForURL(/\/groups\/[0-9a-f-]+$/);
  const groupUrl = page.url();
  const groupId = groupUrl.split("/groups/")[1];
  await expect(page.getByRole("heading", { name: "Climbing Buddies" })).toBeVisible();
  await expect(page.getByText(/when everyone.?s free/i)).toBeVisible();
  await page.screenshot({ path: "screenshots/06-group-detail.png", fullPage: true });

  // 7. Set availability (a manual block)
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await page.waitForURL("**/availability");
  await page.fill("#date", todayISODate());
  await page.fill("#label", "Work");
  await page.getByRole("button", { name: /add block/i }).click();
  await expect(page.getByText("Work")).toBeVisible();
  await page.screenshot({ path: "screenshots/07-availability.png", fullPage: true });

  // 7b. Calendars page — Google isn't configured in the e2e env, so the page
  // renders the "not configured" notice rather than the Connect button.
  await page.getByRole("link", { name: "Calendars", exact: true }).click();
  await page.waitForURL("**/calendars");
  await expect(page.getByRole("heading", { name: /^calendars$/i })).toBeVisible();
  await expect(page.getByText(/isn.t configured on this server/i)).toBeVisible();
  await page.screenshot({ path: "screenshots/07b-calendars.png", fullPage: true });

  // 8. Heatmap reflects availability
  await page.goto(groupUrl);
  await expect(page.getByText(/1 member/)).toBeVisible();
  await page.screenshot({ path: "screenshots/08-heatmap.png", fullPage: true });

  // 9. Create an invite link (via UI) and view the public preview signed-out.
  await page.getByRole("button", { name: /new link/i }).click();
  await expect(page.getByText(/used 0/i)).toBeVisible();

  // Seed a known token via the service role so we can visit the preview URL.
  const { data: profile } = await svc
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  const token = `e2etoken${stamp}`;
  await svc
    .from("group_invites")
    .insert({ group_id: groupId, token, created_by: profile!.id });

  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestPage = await guest.newPage();
  await guestPage.goto(`http://127.0.0.1:3100/invite/${token}`);
  // The invite <title> metadata also contains the group name, so scope to the
  // heading (the AuthCard title) to avoid a strict-mode match on <title>.
  await expect(
    guestPage.getByRole("heading", { name: "Climbing Buddies" }),
  ).toBeVisible();
  await expect(guestPage.getByRole("link", { name: /sign up to join/i })).toBeVisible();
  await guestPage.screenshot({
    path: "screenshots/09-invite-preview.png",
    fullPage: true,
  });
  await guest.close();
});
