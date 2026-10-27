import { test, expect } from "./fixtures.js";
async function preparar(page, rol) {
  const pedidos = [];
  let miembros = [{ email: "yo@test.ec", nombre: "Yo", rol, dosPasos: true }, { email: "ana@test.ec", nombre: "Ana", rol: "matricero", dosPasos: false }];
  await page.route("**/vendor/supabase-js-*.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}})};' }));
  await page.route("**/api/panel-config", r => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route(/\/api\/panel(?:\?|$)/, r => {
    const req = r.request(), b = req.method() === "POST" ? req.postDataJSON() : null;
    const accion = b?.accion || new URL(req.url()).searchParams.get("accion");
    if (accion === "yo") return r.fulfill({ json: { email: "yo@test.ec", nombre: "Yo", rol } });
    if (b) {
      pedidos.push(b);
      if (accion === "invitarMiembro") miembros.push({ ...b, dosPasos: false });
      if (accion === "quitarMiembro") miembros = miembros.filter(p => p.email !== b.email);
    }
    return r.fulfill({ json: accion === "equipo" || b ? { ok: true, miembros, yo: "yo@test.ec", rol } : accion === "metricas" ? { error: "No disponible" } : [], status: accion === "metricas" ? 403 : 200 });
  });
  await page.goto("/panel/");
  await expect(page.locator("#tabs")).toBeVisible();
  return pedidos;
}
test("admin invita y da de baja con confirmación", async ({ page }) => {
  const pedidos = await preparar(page, "admin");
  await page.locator('[data-tab="equipoV"]').click();
  await page.locator("#equipoNombre").fill("Eva");
  await page.locator("#equipoEmail").fill("eva@test.ec");
  await page.locator("#equipoRol").selectOption("notario");
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.locator("#equipoMensaje")).toContainText("Le llegó un correo");
  expect(pedidos[0]).toEqual({ accion: "invitarMiembro", nombre: "Eva", email: "eva@test.ec", rol: "notario" });
  page.once("dialog", async d => { expect(d.message()).toContain("Ana"); await d.accept(); });
  await page.locator('[data-equipo-quitar="ana@test.ec"]').click();
  await expect(page.locator('[data-equipo-quitar="ana@test.ec"]')).toHaveCount(0);
  expect(pedidos[1]).toEqual({ accion: "quitarMiembro", email: "ana@test.ec" });
});
for (const width of [390, 1366]) test(`notario ve Equipo y solo Matricero a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await preparar(page, "notario");
  await expect(page.locator('[data-tab="funcionesV"]')).toBeHidden();
  await expect(page.locator('[data-tab="metricasV"]')).toBeHidden();
  await page.locator('[data-tab="equipoV"]').click();
  await expect(page.locator("#equipoRol option")).toHaveCount(1);
  await expect(page.locator("#equipoRol")).toHaveValue("matricero");
  await expect(page.locator("[data-equipo-rol]")).toHaveCount(0);
  await expect(page.locator("#perfilSesion")).toHaveText("Notario");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("personal no ve Equipo", async ({ page }) => {
  await preparar(page, "matricero");
  await expect(page.locator('[data-tab="equipoV"]')).toBeHidden();
  await expect(page.locator("#equipoV")).toBeHidden();
});
