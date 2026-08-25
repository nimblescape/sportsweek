import { test, expect } from "@playwright/test";

test("unauthenticated visitor is redirected to sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "SportsWeek" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
});

test("unauthenticated visitor hitting a protected route is redirected with a next param", async ({
  page,
}) => {
  await page.goto("/app/dashboard");

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fdashboard/);
});
