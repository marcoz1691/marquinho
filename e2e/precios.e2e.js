import { test, expect } from "./fixtures.js";

async function preparar(page, esAdmin, editada = {}, extra = {}) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'TOKEN'}}}),signOut:async()=>({})}})};` }));
  await page.route("**/api/panel-config", (r) => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route("**/api/panel?**", (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("accion") === "yo" ? { email: "yo@test.ec", nombre: "Yo", rol: esAdmin ? "admin" : "personal" } : new URL(r.request().url()).searchParams.get("accion") === "precios" ? {
    ...extra, esAdmin, tarifas: { sbu: 482, anio: "2026", iva: 0.15, tablas: { inmueble: [[null, 0.1]] } },
    tramites: [{ id: "poder", nombre: "Poder general", tarifa: { tipo: "pct", valor: 0.12, unidad: "", tabla: "" }, editada: false, ...editada }]
  } : [] }));
  await page.route("**/api/panel", async (r) => { pedidos.push(r.request().postDataJSON()); await r.fulfill({ json: { ok: true } }); });
  await page.goto("/panel/");
  await page.getByRole("button", { name: "Trámites", exact: true }).click();
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
  await expect(page.locator("#preciosV input")).toHaveCount(2);
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

 test("precios: Guardar solo se habilita con cambios y conserva el borrador al buscar", async ({ page }) => {
  await preparar(page, true);
  const fila = page.locator(".precio-fila"), guardar = fila.getByRole("button", { name: "Guardar", exact: true });
  await expect(guardar).toBeDisabled();
  await fila.locator('[data-campo="valor"]').fill("10");
  await expect(guardar).toBeEnabled();
  await expect(fila).toContainText("Cambios sin guardar");
  await page.getByLabel("Buscar trámite").fill("otro");
  await page.getByLabel("Buscar trámite").fill("");
  await expect(fila.locator('[data-campo="valor"]')).toHaveValue("10");
  await fila.locator('[data-campo="valor"]').fill("12");
  await expect(guardar).toBeDisabled();
});

test("trámites: con el lápiz se edita el texto y se envía cada requisito y paso por separado @movil", async ({ page }) => {
  const pedidos = await preparar(page, true, { desc: "Autoriza a otra persona.", req: ["Minuta"], pasos: ["Firma"], nota: "" });
  const fila = page.locator(".precio-fila");
  await fila.getByRole("button", { name: "Editar el texto de Poder general" }).click();
  const editor = page.locator(".texto-editor");
  await expect(editor.getByLabel("Nombre")).toHaveValue("Poder general");
  await editor.getByLabel("Nombre").fill("Poder general o especial");
  await editor.getByLabel("Requisitos").fill("Minuta firmada por un abogado\n\nCédula del poderdante");
  await expect(fila.getByRole("button", { name: /Guardar/ })).toHaveCount(1);
  await fila.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ accion: "guardarTexto", tramiteId: "poder", nombre: "Poder general o especial", req: ["Minuta firmada por un abogado", "Cédula del poderdante"], pasos: ["Firma"] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("el panel muestra una pantalla de carga hasta saber qué vista abrir", async ({ page }) => {
  let soltar;
  await page.route("**/api/panel-config", async (r) => { await new Promise((ok) => { soltar = ok; }); await r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: true } }); });
  await page.goto("/panel/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#cargando")).toBeVisible();
  await expect.poll(() => typeof soltar).toBe("function");
  soltar();
  await expect(page.locator("#vEntrar")).toBeVisible();
  await expect(page.locator("#cargando")).toBeHidden();
});

test("trámites: un solo Guardar envía el texto y el precio, y se activa solo con cambios", async ({ page }) => {
  const pedidos = await preparar(page, true, { desc: "D", req: ["Minuta"], pasos: ["Firma"], nota: "" });
  page.on("dialog", (d) => d.accept());
  const fila = page.locator(".precio-fila"), guardar = fila.getByRole("button", { name: "Guardar", exact: true });
  await fila.getByRole("button", { name: "Editar el texto de Poder general" }).click();
  await expect(guardar).toBeDisabled();
  await page.locator(".texto-editor").getByLabel("Descripción").fill("Otra descripción");
  await fila.locator('[data-campo="valor"]').fill("20");
  await guardar.click();
  await expect.poll(() => pedidos.map((p) => p.accion)).toEqual(["guardarTexto", "guardarPrecio"]);
  expect(pedidos[0]).toMatchObject({ desc: "Otra descripción" });
  expect(pedidos[1]).toMatchObject({ tramiteId: "poder", valor: 0.2 });
});

test("trámites: la unidad se puede dejar en blanco y guardar", async ({ page }) => {
  const pedidos = await preparar(page, true, { tarifa: { tipo: "fija", valor: 2, unidad: "por hoja", tabla: "" } });
  page.on("dialog", (d) => d.accept());
  const fila = page.locator(".precio-fila");
  await fila.locator('[data-campo="unidad"]').fill("");
  await fila.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => pedidos[0]).toMatchObject({ accion: "guardarPrecio", tramiteId: "poder", unidad: "" });
});

test("trámites: borrar pide confirmación antes de enviar @movil", async ({ page }) => {
  const pedidos = await preparar(page, true);
  const fila = page.locator(".precio-fila");
  page.once("dialog", (d) => d.dismiss());
  await fila.getByRole("button", { name: "Borrar Poder general" }).click();
  expect(pedidos).toHaveLength(0);
  page.once("dialog", (d) => { expect(d.message()).toContain("Poder general"); d.accept(); });
  await fila.getByRole("button", { name: "Borrar Poder general" }).click();
  await expect.poll(() => pedidos[0]).toMatchObject({ accion: "borrarTramite", tramiteId: "poder" });
});

test("trámites: una fila borrada solo muestra su estado y Restaurar", async ({ page }) => {
  const pedidos = await preparar(page, true, { borrado: true, borradoPor: "yo@test.ec", borradoEn: "2026-11-01T10:00:00Z" });
  const fila = page.locator(".precio-fila");
  await expect(fila).toContainText("Borrado por yo@test.ec");
  await expect(fila.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(0);
  await expect(fila.getByRole("button", { name: "Editar el texto de Poder general" })).toHaveCount(0);
  await fila.getByRole("button", { name: "Restaurar Poder general" }).click();
  await expect.poll(() => pedidos[0]).toMatchObject({ accion: "restaurarTramite", tramiteId: "poder" });
});

test("trámites: copias no se pueden borrar y el personal no ve el botón", async ({ page }) => {
  await preparar(page, true, { protegido: true });
  await expect(page.locator(".precio-fila").getByRole("button", { name: /^Borrar/ })).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await preparar(page, false, { borrado: false });
  await expect(page.locator(".precio-fila").getByRole("button", { name: /^Borrar/ })).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await preparar(page, false, { borrado: true });
  await expect(page.locator(".precio-fila")).toHaveCount(0);
});

test("trámites: si la sesión se cuelga al guardar, Guardar vuelve a activarse con un aviso", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { window.__colgarSesion = false; });
  await page.route("**/vendor/supabase-js-*.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.supabase={createClient:()=>({auth:{getSession:()=>window.__colgarSesion?new Promise(()=>{}):Promise.resolve({data:{session:{access_token:"t"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:"aal2",nextLevel:"aal2"}}),listFactors:async()=>({data:{totp:[]}})}}})};` }));
  await page.route("**/api/panel-config", (r) => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  await page.route("**/api/panel?**", (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("accion") === "yo" ? { email: "yo@test.ec", nombre: "Yo", rol: "notario" } : new URL(r.request().url()).searchParams.get("accion") === "precios" ? {
    esAdmin: true, tarifas: { sbu: 482, anio: "2026", iva: 0.15, tablas: {} },
    tramites: [{ id: "poder", nombre: "Poder general", desc: "D", req: ["Minuta"], pasos: ["Firma"], nota: "", tarifa: { tipo: "pct", valor: 0.12, unidad: "", tabla: "" } }] } : [] }));
  await page.goto("/panel/");
  await page.getByRole("button", { name: "Trámites", exact: true }).click();
  const fila = page.locator(".precio-fila"), guardar = fila.getByRole("button", { name: "Guardar", exact: true });
  await fila.getByRole("button", { name: "Editar el texto de Poder general" }).click();
  await fila.getByLabel("Nota").fill("Valor referencial.");
  await page.evaluate(() => { window.__colgarSesion = true; });
  await guardar.click();
  await expect(guardar).toBeDisabled();
  await page.clock.runFor(9000);
  await expect(page.locator("#preciosMensaje")).toContainText("Tu sesión no respondió");
  await expect(guardar).toBeEnabled();
});

test("trámites: si el servidor no responde al guardar, Guardar vuelve a activarse con un aviso", async ({ page }) => {
  await page.clock.install();
  await preparar(page, true, { desc: "D", req: ["Minuta"], pasos: ["Firma"], nota: "" });
  await page.unroute("**/api/panel");
  await page.route("**/api/panel", () => {});
  const fila = page.locator(".precio-fila"), guardar = fila.getByRole("button", { name: "Guardar", exact: true });
  await fila.getByRole("button", { name: "Editar el texto de Poder general" }).click();
  await fila.getByLabel("Nota").fill("Valor referencial.");
  await guardar.click();
  await expect(guardar).toBeDisabled();
  await page.clock.runFor(66000);
  await expect(page.locator("#preciosMensaje")).toContainText("El servidor tardó demasiado");
  await expect(guardar).toBeEnabled();
});
