import { test, expect } from "@playwright/test";

const cita = (id, hora, extra = {}) => ({ id, hora, nombre: "Cliente " + id, tramite: "Poder general", codigo: "4" + id, estado: "confirmada", atiendeEmail: "", atiendeNombre: "", ...extra });

async function preparar(page, rol) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"t"}}})}})};' }));
  await page.route("**/api/panel-config", (r) => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  const mias = [cita("11", "10:00", { atiendeEmail: "ana@test.ec", atiendeNombre: "Ana" })], libres = [cita("22", "11:00")];
  await page.route(/\/api\/panel(?:\?|$)/, (r) => {
    const q = new URL(r.request().url()).searchParams, a = q.get("accion");
    if (r.request().method() === "POST") { pedidos.push(r.request().postDataJSON()); return r.fulfill({ json: {} }); }
    if (a === "yo") return r.fulfill({ json: { email: "ana@test.ec", nombre: "Ana", rol } });
    if (a === "miTurno") return r.fulfill({ json: { fecha: "2026-10-27", mias, sinAsignar: libres, deOtros: [] } });
    if (a === "documentosDeCita") return r.fulfill({ json: [{ id: "d1", descripcion: "Cédula", estado: "recibido" }] });
    if (a === "agenda") return r.fulfill({ json: { fecha: "2026-10-27", personal: [{ email: "ana@test.ec", nombre: "Ana", rol: "matricero" }], citas: [...mias, ...libres] } });
    return r.fulfill({ json: [] });
  });
  await page.goto("/panel/");
  return pedidos;
}

for (const width of [390, 1366]) test(`el matricero entra a Mi turno, atiende una cita y revisa documentos a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const pedidos = await preparar(page, "matricero");
  await expect(page.locator('[data-tab="turnoV"]')).toHaveClass(/on/);
  await expect(page.locator("#turnoV")).toBeVisible();
  await expect(page.locator("#turnoMias")).toContainText("Cliente 11");
  await expect(page.locator("#turnoLibres")).toContainText("Cliente 22");
  await page.locator('[data-turno-atender="22"]').click();
  await expect.poll(() => pedidos.find((p) => p.accion === "atenderCita")).toEqual({ accion: "atenderCita", id: "22" });
  await page.locator('[data-turno-docs="11"]').click();
  await expect(page.locator("#docs-11")).toContainText("Cédula");
  await page.locator('[data-turno-doc="d1"][data-estado="aprobado"]').click();
  await expect.poll(() => pedidos.find((p) => p.accion === "revisarDocumento")).toMatchObject({ id: "d1", estado: "aprobado" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("el notario no ve Mi turno y entra a Inicio con «Quién tiene qué»", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 844 });
  await preparar(page, "notario");
  await expect(page.locator('[data-tab="turnoV"]')).toBeHidden();
  await expect(page.locator('[data-tab="inicioV"]')).toHaveClass(/on/);
  await expect(page.locator("#inicioEquipo")).toContainText("Ana");
  await expect(page.locator("#inicioEquipo")).toContainText("sin responsable");
});
