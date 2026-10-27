import { test, expect } from "./fixtures.js";
// «Ver como»: el administrador revisa el panel con el perfil de notario o de personal.
async function preparar(page) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}})};' }));
  await page.route("**/api/panel-config", r => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route(/\/api\/panel(?:\?|$)/, r => {
    const req = r.request(), b = req.method() === "POST" ? req.postDataJSON() : null, vista = req.headers()["x-ver-como"];
    const accion = b?.accion || new URL(req.url()).searchParams.get("accion"), rol = vista || "admin";
    pedidos.push({ accion, vista });
    if (accion === "yo") return r.fulfill({ json: { email: "yo@test.ec", nombre: "Yo", rol, ...(vista && { vistaPrevia: true }) } });
    if (accion === "funciones") return rol === "admin" ? r.fulfill({ json: { esAdmin: true, funciones: [] } }) : r.fulfill({ status: 403, json: { error: "Solo un administrador puede cambiar las funciones." } });
    if (accion === "metricas") return r.fulfill({ status: 403, json: { error: "No disponible" } });
    if (accion === "equipo") return r.fulfill({ json: { miembros: [{ email: "yo@test.ec", nombre: "Yo", rol: "admin", dosPasos: true }], yo: "yo@test.ec", rol } });
    return r.fulfill({ json: [] });
  });
  await page.goto("/panel/");
  await expect(page.locator("#tabs")).toBeVisible();
  return pedidos;
}
for (const width of [390, 1366]) test(`el administrador ve el panel como Notario y vuelve a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const pedidos = await preparar(page);
  const aviso = page.locator("#vistaPrevia"), selector = page.getByLabel("Ver como");
  await expect(aviso).toBeHidden();
  await expect(selector).toHaveValue("");
  await page.locator('[data-tab="funcionesV"]').click();
  await selector.selectOption("notario");
  await expect(aviso).toHaveText(/Estás viendo el panel como Notario\. Es solo una vista previa: no se guardan cambios\./);
  await expect(page.locator('[data-tab="funcionesV"]')).toBeHidden();
  await expect(page.locator('[data-tab="metricasV"]')).toBeHidden();
  await expect(page.locator('[data-tab="equipoV"]')).toBeVisible();
  await expect(page.locator('[data-tab="inicioV"]')).toHaveClass(/on/);
  await expect(page.locator("#inicioV")).toBeVisible();
  expect(pedidos.filter(p => p.accion === "yo").at(-1).vista).toBe("notario");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Se mantiene al recargar la pestaña del navegador.
  await page.reload();
  await expect(aviso).toBeVisible();
  await expect(page.getByLabel("Ver como")).toHaveValue("notario");
  await page.getByRole("button", { name: "Volver a Administrador" }).click();
  await expect(aviso).toBeHidden();
  await expect(page.locator('[data-tab="funcionesV"]')).toBeVisible();
  await expect(page.getByLabel("Ver como")).toHaveValue("");
  const despues = pedidos.length;
  await page.locator('[data-tab="equipoV"]').click();
  await expect.poll(() => pedidos.slice(despues).some(p => p.accion === "equipo")).toBe(true);
  expect(pedidos.slice(pedidos.findLastIndex(p => p.accion === "yo")).every(p => !p.vista)).toBe(true);
});
