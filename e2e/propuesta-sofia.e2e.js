import { test, expect } from "@playwright/test";

test("la propuesta presenta la suite Sofía y sus planes", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await expect(page).toHaveTitle(/Sofía PreFirma/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cada trámite preparado");
  await expect(page.getByText("Notaría 41")).toHaveCount(0);
  await expect(page.getByText("miNotarIA")).toHaveCount(0);
  await expect(page.locator(".suite h3")).toHaveText(["Alista", "Antesala", "Clara", "Pronta", "Nexo", "Lúcida"]);
  await expect(page.locator(".plan__precio strong")).toHaveText(["59", "119", "179"]);
  await expect(page.locator(".plan--recomendado")).toContainText("PreFirma");
});

test("el pago anual muestra dos meses gratis", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await page.getByRole("button", { name: /Anual/ }).click();
  await expect(page.locator(".plan__precio strong")).toHaveText(["49", "99", "149"]);
  await expect(page.locator(".plan__factura").nth(1)).toContainText("USD 1190 al año");
  await expect(page.getByRole("button", { name: /Anual/ })).toHaveAttribute("aria-pressed", "true");
});

test("@movil la propuesta cabe y conserva planes e integraciones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo aplica al proyecto móvil");
  await page.goto("/propuesta-sofia.html");
  await expect(page.getByText("Prepara expedientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Encuesta y reputación")).toBeVisible();
  const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(cabe).toBe(true);
});
