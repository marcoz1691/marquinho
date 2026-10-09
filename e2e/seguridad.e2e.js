import { test, expect } from "./fixtures.js";

// El servidor de pruebas aplica los encabezados de vercel.json: así se comprueba la CSP real.
test.describe("Política de seguridad (CSP)", () => {
  for (const ruta of ["/", "/asistente.html", "/privacidad.html", "/404.html"]) {
    test(`CF-172 ${ruta} carga sin violar la política de seguridad`, async ({ page }) => {
      const violaciones = [];
      page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violaciones.push(m.text()); });
      const r = await page.goto(ruta);
      expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      await page.waitForLoadState("networkidle");
      expect(violaciones).toEqual([]);
    });
  }

  test("CF-173 envía los encabezados de seguridad", async ({ page }) => {
    const h = (await page.goto("/")).headers();
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
  });
});
