import { test, expect } from "@playwright/test";

test("la propuesta presenta la tesis y calcula escenarios", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await expect(page).toHaveTitle(/Sofía/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("No necesitamos construir otro ERP notarial");
  await expect(page.locator("#clientes")).toHaveText("60");
  await expect(page.locator("#ingreso")).toHaveText("$143 mil");
  await page.locator("#participacion").fill("20");
  await expect(page.locator("#clientes")).toHaveText("119");
  await expect(page.locator("#ingreso")).toHaveText("$284 mil");
  await expect(page.getByRole("link", { name: "miNotarIA" })).toHaveAttribute("rel", "noopener");
});

test("@movil la propuesta cabe en móvil y respeta el contenido principal", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo aplica al proyecto móvil");
  await page.goto("/propuesta-sofia.html");
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await expect(page.getByText("90 días para saber")).toBeVisible();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(ancho).toBe(true);
});
