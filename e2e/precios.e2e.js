import { test, expect } from "./fixtures.js";

async function preparar(page, esAdmin) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'TOKEN'}}}),signOut:async()=>({})}})};` }));
  await page.route("**/api/panel-config", (r) => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route("**/api/panel?**", (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("accion") === "precios" ? {
    esAdmin, tarifas: { sbu: 482, anio: "2026", iva: 0.15, tablas: { inmueble: [[null, 0.1]] } },
    tramites: [{ id: "poder", nombre: "Poder general", tarifa: { tipo: "pct", valor: 0.12, unidad: "", tabla: "" }, editada: false }]
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
  await fila.getByLabel("Valor").fill("10");
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
  await fila.getByLabel("Tipo", { exact: true }).selectOption("fija");
  await fila.getByLabel("Valor", { exact: true }).fill("100");
  await expect(fila.locator("output")).toContainText("115,00");
  await fila.getByLabel("Tipo", { exact: true }).selectOption("cuantia");
  await expect(fila.locator("output")).toHaveText("Según cuantía");
  await expect(fila.getByLabel("Valor", { exact: true })).toBeDisabled();
  await expect(fila.getByLabel("Tabla", { exact: true })).toBeEnabled();
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
