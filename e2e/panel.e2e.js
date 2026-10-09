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
