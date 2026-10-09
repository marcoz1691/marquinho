import { test, expect, simularApi } from "./fixtures.js";
import { readFile } from "node:fs/promises";
const resumen = { tipo: "cita", codigo: "4821", estado: "confirmada", fecha: "2026-10-08", fechaTexto: "jueves 8 de octubre", hora: "10:00", nombre: "Ana", tramite: { id: "poder-natural", nombre: "Poder general" }, direccion: "Simón Bolívar Oe1-222", requisitos: ["Cédula"], costo: { total: "$66,52", detalle: "Incluye IVA" }, aviso: "Valor referencial", subirDocumentos: true };
for (const pagina of [false, true]) {
  for (const ancho of [390, 1280]) {
    test(`cita ${pagina ? "página" : "burbuja"}, ${ancho}px: ticket, calendario, historial y documentos${ancho === 390 ? " @movil" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.emulateMedia({ colorScheme: ancho === 390 ? "dark" : "light" });
      await simularApi(page, () => ({ json: { respuestas: ["Listo"], tarjetas: [resumen] } }));
      const pedidos = [];
      await page.route("**/api/documentos**", async (route) => {
        if (route.request().method() === "GET") {
          // La sesión es la credencial de la conversación: va en una cabecera, nunca en la URL.
          expect(route.request().url()).not.toContain("sesion");
          expect(route.request().headers()["x-sesion"]).toMatch(/^s_[0-9a-f]{24}$/);
          return route.fulfill({ json: { documentos: [{ nombre: "anterior.pdf", descripcion: "Documento anterior", estado: "recibido" }] } });
        }
        pedidos.push(route.request().postDataJSON());
        await route.fulfill({ json: { ok: true, documentos: [{ nombre: "cedula.pdf", descripcion: "Mi cédula", estado: "recibido" }] } });
      });
      await page.goto(pagina ? "/asistente.html" : "/");
      if (!pagina) await page.locator("#chatAbrir").click();
      await page.locator(pagina ? "#texto" : "#chatTexto").fill("Quiero una cita");
      await page.locator(pagina ? "#texto" : "#chatTexto").press("Enter");
      const tarjeta = page.locator(".cita-tarjeta");
      await expect(tarjeta.getByText("Ticket 4821", { exact: true })).toBeVisible();
      const descarga = page.waitForEvent("download");
      await tarjeta.getByRole("button", { name: "Agregar a mi calendario" }).click();
      const archivo = await descarga;
      expect(archivo.suggestedFilename()).toBe("cita-4821.ics");
      expect(await readFile(await archivo.path(), "utf8")).toContain("DTSTART;TZID=America/Guayaquil:20261008T100000");
      await page.reload();
      if (!pagina) await page.locator("#chatAbrir").click();
      await expect(tarjeta.getByText("Ticket 4821", { exact: true })).toBeVisible();
      await tarjeta.getByRole("button", { name: "Subir documentos" }).click();
      await expect(tarjeta.getByText("Documento anterior", { exact: false })).toBeVisible();
      await tarjeta.getByLabel("Archivo").setInputFiles({ name: "cedula.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
      await tarjeta.getByLabel("Descripción").fill("Mi cédula");
      await tarjeta.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(tarjeta.locator('[aria-live="polite"]')).toHaveText("Acepta el aviso de privacidad para enviar documentos.");
      expect(pedidos).toHaveLength(0);
      await tarjeta.getByRole("checkbox").check();
      await tarjeta.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(tarjeta.locator('[aria-live="polite"]')).toHaveText("Documento enviado.");
      expect(pedidos[0]).toMatchObject({ ticket: "4821", descripcion: "Mi cédula", nombre: "cedula.pdf", aceptaAviso: true, base64: Buffer.from("%PDF-1.4 prueba").toString("base64") });
      await expect(tarjeta.getByText("Mi cédula · cedula.pdf · recibido")).toBeVisible();
      await page.route("**/api/documentos**", (route) => route.fulfill({ status: 413, json: { error: "El archivo pesa más de 3 MB… <script>" } }));
      await tarjeta.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(tarjeta.locator('[aria-live="polite"]')).toHaveText("El archivo pesa más de 3 MB… <script>");
      expect(await tarjeta.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
    });
  }
}

for (const pagina of [false, true]) {
  test(`cita ${pagina ? "página" : "burbuja"}: al abrir «Subir documentos» el formulario queda a la vista y no lo tapa la caja de escritura @movil`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await simularApi(page, () => ({ json: { respuestas: ["Listo"], tarjetas: [resumen] } }));
    await page.route("**/api/documentos**", (route) => route.fulfill({ json: { documentos: [] } }));
    await page.goto(pagina ? "/asistente.html" : "/");
    if (!pagina) await page.locator("#chatAbrir").click();
    await page.locator(pagina ? "#texto" : "#chatTexto").fill("Quiero una cita");
    await page.locator(pagina ? "#texto" : "#chatTexto").press("Enter");
    const tarjeta = page.locator(".cita-tarjeta");
    await expect(tarjeta.getByText("Ticket 4821", { exact: true })).toBeVisible();
    await tarjeta.getByRole("button", { name: "Subir documentos" }).click();
    const enviar = tarjeta.getByRole("button", { name: "Enviar", exact: true });
    await expect(enviar).toBeInViewport({ ratio: 1 });
    // Nada encima: el elemento que está en el centro del botón es el propio botón (no la caja de escritura).
    await expect.poll(async () => enviar.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  });
}
