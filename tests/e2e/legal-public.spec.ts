import { expect, test } from "@playwright/test";

// Public, ungated surfaces — these must render for signed-out visitors and
// crawlers (legal pages are a launch requirement).

test.describe("Public pages", () => {
  test("privacy and terms render signed-out", async ({ page }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }),
    ).toBeVisible();

    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: /terms of service/i }),
    ).toBeVisible();
  });

  test("landing footer links reach the legal pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^privacy$/i }).click();
    await expect(page).toHaveURL(/\/privacy/);

    await page.goto("/");
    await page.getByRole("link", { name: /^terms$/i }).click();
    await expect(page).toHaveURL(/\/terms/);
  });

  test("design style guide renders", async ({ page }) => {
    await page.goto("/design");
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
