import { test, expect } from "./fixtures.js";
async function panel(page, admin = true) {
  const pedidos = [];
  let activa = true;
  await page.route("**/vendor/supabase-js-*.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}})};' }));
  await page.route("**/api/panel-config", r => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route(/\/api\/panel(?:\?|$)/, r => {
    const req = r.request(), p = new URL(req.url()).searchParams, body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body) { pedidos.push(body); activa = body.activa; }
    const accion = body?.accion || p.get("accion");
    if (accion === "funciones" || accion === "guardarFuncion") return r.fulfill({ json: { esAdmin: admin, funciones: [{ id: "agenda", nombre: "Agendar citas", descripcion: "Agenda en línea", efectoAlApagar: "Se ocultan los botones de agenda.", activa }] } });
    if (accion === "metricas") {
      pedidos.push(Object.fromEntries(p));
      if (!admin) return r.fulfill({ status: 403, json: { error: "Solo administradores" } });
      return r.fulfill({ json: { desde: p.get("desde"), hasta: p.get("hasta"), pilotoInicio: null, totales: { "conv.nueva.web": 10, "conv.derivada.web": 2, "cita.atendida": 3, "cita.inasistencia": 1 }, porDia: [{ fecha: p.get("desde"), valores: { "conv.nueva.web": 10 } }], precios: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5, plantillaWhatsapp: 0 }, costo: { ia: 1.23, whatsapp: 0, total: 1.23, porConversacion: 0.123 } } });
    }
    return r.fulfill({ json: [] });
  });
  await page.goto("/panel/");
  await expect(page.locator("#tabs")).toBeVisible();
  return pedidos;
}
test("administrador apaga con confirmación y enciende sin ella", async ({ page }) => {
  const pedidos = await panel(page);
  await page.getByRole("button", { name: "Funciones", exact: true }).click();
  const interruptor = page.getByRole("switch", { name: "Agendar citas", exact: true });
  await expect(interruptor).toHaveAttribute("aria-checked", "true");
  let confirmaciones = 0;
  page.on("dialog", async d => { confirmaciones++; expect(d.message()).toContain("Se ocultan"); await d.accept(); });
  await interruptor.click();
  await expect(interruptor).toHaveText("Apagada");
  expect(pedidos).toContainEqual({ accion: "guardarFuncion", id: "agenda", activa: false });
  await interruptor.click();
  await expect(interruptor).toHaveText("Encendida");
  expect(confirmaciones).toBe(1);
  expect(pedidos).toContainEqual({ accion: "guardarFuncion", id: "agenda", activa: true });
});
test("personal consulta funciones y no ve métricas", async ({ page }) => {
  await panel(page, false);
  await page.getByRole("button", { name: "Funciones", exact: true }).click();
  await expect(page.locator("#funcionesLista")).toContainText("Encendida");
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.locator('[data-tab="metricasV"]')).toBeHidden();
});
test("métricas, período y CSV a 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pedidos = await panel(page);
  await page.getByRole("button", { name: "Métricas", exact: true }).click();
  await expect(page.locator("#metricasTarjetas")).toContainText("80,0 %");
  await expect(page.locator("#metricasTarjetas")).toContainText("25,0 %");
  await expect(page.locator("#metricasTarjetas .metrica-numero").first()).toHaveText("10");
  await expect(page.locator('#metricasPeriodo option[value="piloto"]')).toBeDisabled();
  await page.getByLabel("Período", { exact: true }).selectOption("7");
  await expect.poll(() => pedidos.filter(p => p.accion === "metricas").at(-1)?.desde).toBe(new Date(new Date(pedidos.find(p => p.accion === "metricas").hasta + "T12:00:00Z").getTime() - 6 * 864e5).toISOString().slice(0,10));
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV", exact: true }).click();
  const archivo = await descarga;
  const rango = pedidos.filter(p => p.accion === "metricas").at(-1);
  expect(archivo.suggestedFilename()).toBe(`metricas-${rango.desde}-${rango.hasta}.csv`);
  const stream = await archivo.createReadStream(); let csv = "";
  for await (const parte of stream) csv += parte.toString();
  expect(csv.split("\r\n")[0]).toBe('"fecha","cita.atendida","cita.inasistencia","conv.derivada.web","conv.nueva.web"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Funciones", exact: true }).click();
  await expect(page.getByRole("switch")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
