import { test, expect } from "@playwright/test";

test("la propuesta presenta la suite Sofía y sus planes", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await expect(page).toHaveTitle(/Sofía PreFirma/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("trámite listo para avanzar");
  await expect(page.getByText("Notaría 41")).toHaveCount(0);
  await expect(page.getByText("miNotarIA")).toHaveCount(0);
  await expect(page.locator(".suite h3")).toHaveText(["Antesala", "Alista", "Clara", "Pronta", "Nexo", "Lúcida"]);
  await expect(page.locator(".plan__precio strong")).toHaveText(["59", "119", "149", "179", "229"]);
  await expect(page.locator(".plan--recomendado")).toContainText("PreFirma");
  await expect(page.getByRole("button", { name: /Guardar en PDF/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "De la demostración a una primera etapa controlada." })).toBeVisible();
  await expect(page.locator(".piloto__pasos > div")).toHaveCount(4);
});

test("el pago anual muestra dos meses gratis", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await page.getByRole("button", { name: /Anual/ }).click();
  await expect(page.locator(".plan__precio strong")).toHaveText(["49", "99", "124", "149", "191"]);
  await expect(page.locator(".plan__factura").nth(1)).toContainText("USD 1190 al año");
  await expect(page.getByRole("button", { name: /Anual/ })).toHaveAttribute("aria-pressed", "true");
});

test("@movil la propuesta cabe y conserva planes e integraciones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo aplica al proyecto móvil");
  await page.goto("/propuesta-sofia.html");
  await expect(page.getByText("Prepara expedientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Pagos para tus clientes")).toBeVisible();
  const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(cabe).toBe(true);
});

test("elegir un plan explica el siguiente paso", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await page.getByRole("link", { name: "Elegir Equipo" }).click();
  await expect(page.locator("#seleccion-titulo")).toHaveText("Elegiste Equipo. Ahora lo adaptamos a tu notaría.");
  await expect(page.locator("#seleccion-texto")).toContainText("coordinamos la activación y el pago");
});

test("la propuesta tiene una versión limpia para imprimir en PDF", async ({ page }) => {
  await page.goto("/propuesta-sofia.html");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".hero__acciones")).toBeHidden();
  await expect(page.locator(".suite")).toBeVisible();
  await expect(page.locator(".planes__grid")).toBeVisible();
});
