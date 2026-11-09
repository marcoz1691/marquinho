import { test, expect, abrirPortada } from "./fixtures.js";
async function configurar(page, json) {
  await page.route("**/api/precios", (r) => r.fulfill({ json: { precios: {}, ...json } }));
}

test("tarifario apagado: «Tarifas» funciona como antes y la página lo explica", async ({ page }) => {
  await configurar(page, { funciones: {} });
  await abrirPortada(page);
  await expect(page.locator("#menuTarifas")).toHaveAttribute("href", "#catalogo");
  for (const el of await page.locator('[data-funcion="tarifario"]').all()) await expect(el).toBeHidden();
  await page.goto("/tarifas.html");
  await expect(page.locator("#estado")).toContainText("El tarifario no está disponible por ahora");
  await expect(page.locator("#contenido")).toBeHidden();
});

test("tarifario encendido: tablas con el SBU del panel y botón para descargar el PDF @movil", async ({ page }) => {
  await configurar(page, { funciones: { tarifario: true }, sbu: 500, anio: "2027" });
  await abrirPortada(page);
  await expect(page.locator("#menuTarifas")).toHaveAttribute("href", "tarifas.html");
  await expect(page.locator(".calc__tarifario")).toBeVisible();
  await page.goto("/tarifas.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tarifas notariales 2027");
  await expect(page).toHaveTitle(/Tarifas notariales 2027/);
  // Transferencia hasta $10.000 = 0,20 SBU: con el SBU de 500 del panel son $100 + IVA.
  const transferencia = page.getByRole("region", { name: "Transferencia de dominio" });
  await expect(transferencia.locator("tbody tr").first()).toContainText("$100,00");
  await expect(transferencia.locator("tbody tr").last()).toContainText("del excedente");
  await expect(page.getByRole("button", { name: "Descargar PDF" })).toBeVisible();

  await page.getByLabel("Busca un acto").fill("divorcio");
  const filas = page.locator("#indeterminada tbody tr:not([hidden])");
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText("Divorcio por mutuo consentimiento");
  await page.getByLabel("Busca un acto").fill("zzz");
  await expect(page.locator("#vacio")).toContainText("No encontramos ese acto");

  // La página no se desborda en el teléfono: las tablas se desplazan dentro de su marco.
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ancho).toBeLessThanOrEqual(0);
});

test("la versión impresa lleva el encabezado de la Notaría 41 y oculta los botones", async ({ page }) => {
  await configurar(page, { funciones: { tarifario: true } });
  await page.goto("/tarifas.html");
  await expect(page.locator("#contenido")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".tarifario__impresion")).toBeVisible();
  await expect(page.locator(".tarifario__impresion")).toContainText("Notaría 41 del cantón Quito");
  await expect(page.locator("#impNotario")).toContainText("Albornoz");
  await expect(page.getByRole("button", { name: "Descargar PDF" })).toBeHidden();
  await expect(page.locator(".nav")).toBeHidden();
});
