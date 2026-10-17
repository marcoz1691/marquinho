import { test, expect, simularApi } from "./fixtures.js";

test.use({ aceptacionPrevia: false });
for (const pagina of [false, true]) {
  for (const sinAlmacen of [false, true]) {
    test(`aceptación ${pagina ? "página" : "burbuja"}, almacenamiento ${sinAlmacen ? "bloqueado" : "normal"} @movil`, async ({ page }) => {
      if (sinAlmacen) await page.addInitScript(() => {
        Storage.prototype.setItem = () => { throw new Error("Almacenamiento bloqueado"); };
      });
      const pedidos = await simularApi(page, () => ({ json: { respuestas: ["Hola"] } }));
      await page.goto(pagina ? "/asistente.html" : "/");
      if (!pagina) await page.locator("#chatAbrir").click();
      const campo = page.locator(pagina ? "#texto" : "#chatTexto");
      const caja = page.locator(".aceptacion");
      await expect(caja.getByRole("checkbox")).toHaveCount(2);
      await expect(caja.locator("input:checked")).toHaveCount(0);
      for (const link of await caja.getByRole("link").all()) {
        const response = await page.request.get(await link.getAttribute("href"));
        expect(response.ok()).toBe(true);
      }
      await campo.fill("Necesito una cita");
      await campo.press("Enter");
      await expect(caja.getByRole("alert")).toBeVisible();
      await expect(campo).toHaveValue("Necesito una cita");
      expect(pedidos).toHaveLength(0);
      await caja.locator('[name="aceptaTerminos"]').check();
      await campo.press("Enter");
      expect(pedidos).toHaveLength(0);
      await expect(caja.locator('[name="aceptaDatos"]')).toBeFocused();
      await caja.locator('[name="aceptaDatos"]').check();
      await page.locator(pagina ? "#enviar" : '#chatForm button').click();
      await expect(caja).toHaveCount(0);
      await expect.poll(() => pedidos.length).toBe(1);
      expect(pedidos[0]).toMatchObject({ texto: "Necesito una cita", aceptaTerminos: true, aceptaDatos: true });
      await campo.fill("Otra consulta");
      await campo.press("Enter");
      await expect.poll(() => pedidos.length).toBe(2);
      if (!sinAlmacen) {
        await page.reload();
        await expect(caja).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("una versión anterior exige nuevas casillas @movil", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("n41-acepta", JSON.stringify({ aviso: "anterior", terminos: "anterior" })));
  await page.goto("/asistente.html");
  await expect(page.locator(".aceptacion")).toBeVisible();
  await expect(page.locator(".aceptacion input:checked")).toHaveCount(0);
});
