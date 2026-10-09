import { test, expect } from "./fixtures.js";

// El panel con una configuración simulada (Supabase no responde en las pruebas): debe cargar sin errores y mostrar el acceso.
test.describe("Panel del personal", () => {
  test("CF-170 carga sin errores de JavaScript y muestra el inicio de sesión", async ({ page }) => {
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/panel-config", (route) => route.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "clave-publica", mfa: true } }));
    await page.goto("/panel/");
    await expect(page.locator("#vEntrar")).toBeVisible();
    await expect(page.locator("#vEntrar h1")).toHaveText("Panel de la notaría");
    expect(errores).toEqual([]);
  });

  test("CF-171 las pantallas de verificación en dos pasos existen y están ocultas al inicio", async ({ page }) => {
    await page.route("**/api/panel-config", (route) => route.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "clave-publica", mfa: true } }));
    await page.goto("/panel/");
    await expect(page.locator("#vEntrar")).toBeVisible();
    await expect(page.locator("#vMfaAlta")).toBeHidden();
    await expect(page.locator("#vMfaCodigo")).toBeHidden();
    await expect(page.locator("#mfaCodigo")).toHaveAttribute("autocomplete", "one-time-code");
  });
});

test("ticket en agenda y conversación; búsqueda de cuatro dígitos y Ver chat", async ({ page }) => {
  // Sesión y API simuladas: no se conecta con Supabase ni con una base de datos.
  await page.route("**/vendor/supabase-js-*.js", (route) => route.fulfill({ contentType: "text/javascript", body: 'window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "simulado", user: { email: "prueba@example.test" } } } }) } }) };' }));
  await page.route("**/api/panel-config", (route) => route.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  const cita = { id: "cita1", codigo: "4821", fecha: "2026-10-08", hora: "10:00", nombre: "Ana", tramite: "Poder general", estado: "confirmada", telefono: "593999999999", conversacionId: "conv1" };
  const busquedas = [];
  await page.route("**/api/panel?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    let json;
    if (params.get("accion") === "agenda") json = { fecha: "2026-10-08", citas: [cita], personal: [] };
    else if (params.get("accion") === "buscarTicket") { busquedas.push(params.get("codigo")); json = [cita]; }
    else if (params.get("accion") === "detalle") json = { conversacion: { id: "conv1", nombre: "Ana", canal: "web" }, canal: "web", citas: [cita], documentos: [], mensajes: [], puedeResponder: false };
    else json = [{ id: "conv1", nombre: "Ana", canal: "web" }];
    await route.fulfill({ json });
  });
  await page.goto("/panel/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.locator("#agLista").getByText("Ticket 4821")).toBeVisible();
  await page.getByLabel("Buscar ticket").fill("4821");
  await page.locator("#agBuscar").getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.locator("#agResultados")).toContainText("Ticket 4821");
  expect(busquedas).toEqual(["4821"]);
  await page.locator("#agResultados").getByRole("button", { name: "Ver chat" }).click();
  await expect(page.locator("#detalle .lado")).toContainText("10:00 · Ticket 4821");
});

async function agendaSimulada(page, admin = true, fallaConfig = false) {
  const pedidos = [];
  await page.route("**/vendor/supabase-js-*.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}})};' }));
  await page.route("**/api/panel-config", r => r.fulfill({ json: { supabaseUrl: "https://ejemplo.supabase.co", supabaseAnonKey: "publica", mfa: false } }));
  const config = { esAdmin: admin, porHora: 2, porHoraOficial: 2, bloqueos: [{ fecha: "2099-12-25", hora: null, motivo: "Feriado", fijo: true }, { fecha: "2099-12-24", hora: "09:00", motivo: "Reunión" }] };
  const citas = ["pendiente", "confirmada", "atendida", "rechazada"].map((estado,i) => ({ id: `c${i}`, codigo: `482${i}`, fecha: "2026-10-12", hora: "09:00", nombre: `Cliente ${i}`, tramite: "", estado, telefono: "593999999991", canal: i === 0 ? "formulario" : i === 1 ? "web" : "whatsapp", conversacionId: `conv${i}` }));
  await page.route("**/api/panel?**", r => {
    const accion = new URL(r.request().url()).searchParams.get("accion");
    if (accion === "citasConfig" && fallaConfig) return r.fulfill({ status: 404, json: { error: "No disponible" } });
    return r.fulfill({ json: accion === "agenda" ? { fecha: "2026-10-12", citas, personal: [{ nombre: "Ana" }] } : accion === "citasConfig" ? config : accion === "detalle" ? { conversacion: { nombre: "Cliente 0" }, citas: [citas[0]], documentos: [], mensajes: [], puedeResponder: false } : [] });
  });
  await page.route("**/api/panel", r => { pedidos.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, ...config } }); });
  await page.goto("/panel/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  return pedidos;
}

test("agenda: columnas alineadas, canales, teléfono y filtros por estado", async ({ page }) => {
  await agendaSimulada(page);
  await expect(page.locator("#agLista .ag-cita")).toHaveCount(4);
  await expect(page.locator("#agLista")).toContainText("Formulario");
  await expect(page.locator("#agLista")).toContainText("Chat web");
  await expect(page.locator("#agLista")).toContainText("WhatsApp");
  await expect(page.locator("#agLista a").first()).toHaveText("099 999 9991");
  await expect(page.locator("#agLista a").first()).toHaveAttribute("href", "https://wa.me/593999999991");
  if (page.viewportSize().width > 1100) {
    const posiciones = await page.locator("#agLista select").evaluateAll(xs => xs.map(x => x.getBoundingClientRect().x));
    expect(Math.max(...posiciones) - Math.min(...posiciones)).toBeLessThan(1);
  }
  const pendientes = page.locator('[data-filtro-ag="pendiente"]');
  await expect(pendientes).toHaveText("Pendientes 1");
  await pendientes.click();
  await expect(pendientes).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#agLista .ag-cita")).toHaveCount(1);
  await page.locator("#agLista").getByRole("button", { name: "Ver detalle", exact: true }).click();
  await expect(page.locator("#detalle .lado")).toContainText("Ticket 4820");
});

test("agenda: cupos y bloqueos solo para administradores", async ({ page }) => {
  const pedidos = await agendaSimulada(page);
  await expect(page.locator("#agConfig")).toBeVisible();
  await page.getByText("Cupos y bloqueos", { exact: true }).click();
  await expect(page.locator(".bloqueos button")).toHaveCount(1);
  await page.getByLabel("Citas por hora", { exact: true }).fill("3");
  await page.locator("#agCupo").getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toEqual({ accion: "guardarCupo", porHora: 3 });
  await page.getByLabel("Fecha del bloqueo").fill("2099-12-20");
  await page.getByLabel("Motivo", { exact: true }).fill("Mantenimiento");
  await page.getByRole("button", { name: "Agregar bloqueo", exact: true }).click();
  await expect.poll(() => pedidos.length).toBe(2);
  expect(pedidos[1]).toEqual({ accion: "agregarBloqueo", fecha: "2099-12-20", hora: null, motivo: "Mantenimiento" });
});

for (const falla of [false, true]) test(`agenda: configuración oculta ${falla ? "si falla la API" : "para personal"} @movil`, async ({ page }) => {
  await agendaSimulada(page, false, falla);
  await expect(page.locator("#agLista .ag-cita")).toHaveCount(4);
  await expect(page.locator("#agConfig")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
