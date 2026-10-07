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
