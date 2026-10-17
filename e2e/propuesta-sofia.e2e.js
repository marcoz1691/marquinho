import { test, expect } from "@playwright/test";

test("la propuesta vende Sofía a una notaría y muestra planes", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await expect(page).toHaveTitle(/Sofía para notarías/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu notaría responde");
  await expect(page.getByText("Notaría 41")).toHaveCount(0);
  await expect(page.getByText("miNotarIA")).toHaveCount(0);
  await expect(page.locator(".plan__precio strong")).toHaveText(["69", "129", "189"]);
  await expect(page.locator(".plan--recomendado")).toContainText("Sofía");
});

test("el pago anual muestra dos meses gratis", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await page.getByRole("button", { name: /Anual/ }).click();
  await expect(page.locator(".plan__precio strong")).toHaveText(["58", "108", "158"]);
  await expect(page.locator(".plan__factura").nth(1)).toContainText("USD 1290 al año");
  await expect(page.getByRole("button", { name: /Anual/ })).toHaveAttribute("aria-pressed", "true");
});

test("@movil la propuesta cabe y conserva planes e integraciones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo aplica al proyecto móvil");
  await page.goto("/propuesta-sofia.html");
  await expect(page.getByText("Atención de principio a fin", { exact: true })).toBeVisible();
  await expect(page.getByText("Encuesta y reputación")).toBeVisible();
  const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(cabe).toBe(true);
});
