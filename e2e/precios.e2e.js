import { test, expect } from "./fixtures.js";

async function preparar(page, esAdmin, editada = {}, extra = {}) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'TOKEN'}}}),signOut:async()=>({})}})};` }));
  await page.route("**/api/panel-config", (r) => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route("**/api/panel?**", (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("accion") === "precios" ? {
    ...extra, esAdmin, tarifas: { sbu: 482, anio: "2026", iva: 0.15, tablas: { inmueble: [[null, 0.1]] } },
    tramites: [{ id: "poder", nombre: "Poder general", tarifa: { tipo: "pct", valor: 0.12, unidad: "", tabla: "" }, editada: false, ...editada }]
  } : [] }));
  await page.route("**/api/panel", async (r) => { pedidos.push(r.request().postDataJSON()); await r.fulfill({ json: { ok: true } }); });
  await page.goto("/panel/");
  await page.getByRole("button", { name: "Precios", exact: true }).click();
  return pedidos;
}

test("precios: el administrador ve IVA al instante y confirma antes de guardar", async ({ page }) => {
  const pedidos = await preparar(page, true);
  const fila = page.locator(".precio-fila");
  await expect(fila.locator("output")).toContainText("66,52");
  await fila.locator('[data-campo="valor"]').fill("10");
  await expect(fila.locator("output")).toContainText("55,43");
  page.once("dialog", async (d) => { expect(d.message()).toContain("Antes → Después"); await d.dismiss(); });
  await fila.getByRole("button", { name: "Guardar", exact: true }).click();
  expect(pedidos).toHaveLength(0);
  page.once("dialog", (d) => d.accept());
  await fila.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ accion: "guardarPrecio", tramiteId: "poder", valor: 0.1 });
  await page.getByLabel("Buscar trámite").fill("inexistente");
  await expect(page.locator(".precio-fila")).toHaveCount(0);
});

test("precios: el personal consulta sin controles de edición @movil", async ({ page }) => {
  await preparar(page, false);
  await expect(page.locator(".precio-fila output")).toContainText("66,52");
  await expect(page.locator("#preciosV button")).toHaveCount(0);
  await expect(page.locator("#preciosV select")).toHaveCount(0);
  await expect(page.locator("#preciosV input")).toHaveCount(1);
});

test("precios: cambia tipo, SBU y restaura el valor oficial", async ({ page }) => {
  const pedidos = await preparar(page, true);
  const fila = page.locator(".precio-fila");
  await fila.locator('[data-campo="tipo"]').selectOption("fija");
  await fila.locator('[data-campo="valor"]').fill("100");
  await expect(fila.locator("output")).toContainText("115,00");
  await fila.locator('[data-campo="tipo"]').selectOption("cuantia");
  await expect(fila.locator("output")).toHaveText("Según cuantía");
  await expect(fila.locator('[data-campo="valor"]')).toBeDisabled();
  await expect(fila.locator('[data-campo="tabla"]')).toBeEnabled();
  page.once("dialog", (d) => d.accept());
  await fila.getByRole("button", { name: "Volver al valor oficial" }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toEqual({ accion: "restaurarPrecio", tramiteId: "poder" });
  await expect(fila.locator("output")).toContainText("66,52");
  await page.getByLabel("SBU (USD)").fill("500");
  await page.getByLabel("Año", { exact: true }).fill("2027");
  await expect(fila.locator("output")).toContainText("69,00");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Guardar SBU y año" }).click();
  await expect.poll(() => pedidos.length).toBe(2);
  expect(pedidos[1]).toEqual({ accion: "guardarSBU", sbu: 500, anio: "2027" });
});

test("precios: la etiqueta del valor dice si es un porcentaje o dólares y «Tabla» solo aparece en trámites según cuantía", async ({ page }) => {
  await preparar(page, true);
  const fila = page.locator(".precio-fila");
  const etiqueta = fila.locator("[data-etiqueta-valor]"), tabla = fila.locator('label:has([data-campo="tabla"])');
  await expect(etiqueta).toHaveText("Porcentaje del SBU (%)");
  await expect(tabla).toBeHidden();
  await fila.locator('[data-campo="tipo"]').selectOption("fija");
  await expect(etiqueta).toHaveText("Valor en dólares (USD)");
  await fila.locator('[data-campo="tipo"]').selectOption("cuantia");
  await expect(tabla).toBeVisible();
  await expect(etiqueta).toHaveText("Valor");
  await fila.locator('[data-campo="tipo"]').selectOption("consultar");
  await expect(tabla).toBeHidden();
});

test("precios: la fecha de la última edición se lee como fecha, no como código", async ({ page }) => {
  await preparar(page, true, { editada: true, actualizadoPor: "carla@notaria41.ec", actualizadoEn: "2026-10-07T15:00:00Z" });
  const nota = page.locator(".precio-fila small").first();
  await expect(nota).toContainText("carla@notaria41.ec");
  await expect(nota).toContainText("7 oct 2026");
  await expect(nota).toContainText("10:00");   // 15:00 UTC = 10:00 en Quito
  await expect(nota).not.toContainText("T15:00:00Z");
});

test("precios: un porcentaje como 7 % se ve «7», no 7.000000000000001", async ({ page }) => {
  await preparar(page, true, { tarifa: { tipo: "pct", valor: 0.07, unidad: "", tabla: "" } });
  await expect(page.locator('.precio-fila [data-campo="valor"]')).toHaveValue("7");
});

test("precios: si el SBU se editó en el panel, ofrece volver al de la hoja de Google", async ({ page }) => {
  const pedidos = await preparar(page, true, {}, { sbuEditado: true, sbuOficial: 482, anioOficial: "2026" });
  await expect(page.locator("#preciosV")).toContainText("La hoja de Google dice");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Volver al SBU de la hoja" }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toEqual({ accion: "restaurarSBU" });
});

test("precios: sin SBU editado no aparece el botón de volver al de la hoja", async ({ page }) => {
  await preparar(page, true);
  await expect(page.getByRole("button", { name: "Volver al SBU de la hoja" })).toHaveCount(0);
});

test("precios: avisa que una conversación ya abierta con Sofía puede seguir citando el valor anterior", async ({ page }) => {
  await preparar(page, true);
  await expect(page.locator("#preciosV")).toContainText("conversación ya abierta");
});
