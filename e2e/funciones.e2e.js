import { test, expect, abrirPortada } from "./fixtures.js";
async function configurar(page, funciones) {
  await page.route("**/api/precios", r => r.fulfill({ json: { precios: {}, funciones } }));
}
test("agenda apagada oculta accesos y ofrece contacto", async ({ page }) => {
  await configurar(page, { agenda: false });
  await abrirPortada(page);
  await expect(page.locator('[data-funcion="agenda"]')).toHaveCount(3);
  for (const el of await page.locator('[data-funcion="agenda"]').all()) await expect(el).toBeHidden();
  await expect(page.getByRole("link", { name: "Agendar cita", exact: true })).toHaveCount(0);
  await page.goto("/cita.html");
  await expect(page.locator("#estado")).toHaveText("La agenda en línea no está disponible por ahora");
  await expect(page.locator("#alternativas").getByRole("link", { name: "Escríbenos por WhatsApp", exact: true })).toBeVisible();
  await expect(page.locator("#alternativas").getByRole("link", { name: "02 600 1141", exact: true })).toBeVisible();
  await expect(page.locator(".cita-layout")).toBeHidden();
});
test("agenda responde apagada aunque la configuración siga encendida", async ({ page }) => {
  await configurar(page, {});
  await page.route("**/api/cita", r => r.fulfill({ status: 503, json: { apagada: true, error: "Agenda apagada" } }));
  await page.goto("/cita.html");
  await expect(page.locator("#estado")).toHaveText("La agenda en línea no está disponible por ahora");
  await expect(page.locator("#alternativas")).toContainText("02 600 1141");
});
test("chat y documentos apagados", async ({ page }) => {
  await configurar(page, { chatWeb: false, documentos: false });
  await abrirPortada(page);
  await expect(page.locator("#chatAbrir")).toBeHidden();
  await expect(page.locator('[data-funcion="documentos"]')).toBeHidden();
  await page.goto("/asistente.html");
  await expect(page.getByRole("heading", { name: "El asistente no está disponible por ahora", exact: true })).toBeVisible();
  await expect(page.locator("#asistenteContacto")).toContainText("02 600 1141");
});
test("configuración caída conserva los accesos", async ({ page }) => {
  await page.route("**/api/precios", r => r.fulfill({ status: 503, json: {} }));
  await abrirPortada(page);
  await expect(page.locator(".nav__agenda")).toBeVisible();
  await expect(page.locator("#chatAbrir")).toBeVisible();
  await expect(page.locator('[data-funcion="documentos"]')).toBeVisible();
});
test("sitio apagado usa mantenimiento y cabe a 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurar(page, { sitio: false });
  await page.goto("/");
  await expect(page).toHaveURL(/mantenimiento.html$/);
  await expect(page.getByRole("heading", { name: "Estamos preparando nuestro sitio", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("chat responde apagada y retira la burbuja", async ({ page }) => {
  await configurar(page, {});
  await page.route("**/api/chat", r => r.fulfill({ status: 503, json: { apagada: true, error: "El asistente de la web no está disponible por ahora. Escríbenos por WhatsApp o llámanos." } }));
  await abrirPortada(page);
  await page.getByRole("button", { name: "Abrir el chat de ayuda", exact: true }).click();
  await page.locator("#chatTexto").fill("Hola");
  await page.locator("#chatForm").evaluate(form => form.requestSubmit());
  await expect(page.locator("#chatAbrir")).toBeHidden();
  await expect(page.locator("#chat")).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("El asistente de la web no está disponible");
});
test("aviso del asistente cabe a 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurar(page, { chatWeb: false });
  await page.goto("/asistente.html");
  await expect(page.locator("#asistenteContacto")).toContainText("02 600 1141");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
