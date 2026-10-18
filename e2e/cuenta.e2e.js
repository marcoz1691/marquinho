import { test, expect } from "./fixtures.js";

const cliente = { id: "cliente-1", email: "ana@example.test", nombres: "Ana", apellidos: "Pérez", celular: "593991234567",
  avisosCorreo: true, avisosWhatsapp: false, perfilCompleto: true };
const item = { id: "tramite-1", nombre: "Poder especial", notaria: "Notaría 41", ticket: "4821", estado: "confirmada",
  estadoTexto: "Cita confirmada", siguientePaso: "Documentos por corregir", cita: { fecha: "2026-11-10", hora: "09:00", estado: "confirmada" },
  documentosPendientes: 1, documentosEnviados: 1, pago: null };
const detalle = { ...item, eventos: [{ tipo: "documento_observado", texto: "La foto está borrosa.", actor: "personal", creado: "2026-10-18T12:00:00Z" }],
  requisitos: ["Cédula original"], pasos: ["Revisión"], costoReferencial: "$11,50", advertencias: ["Valor referencial."],
  documentos: [{ descripcion: "Cédula", nombre: "cedula.pdf", estado: "observado", estadoTexto: "Por corregir", observacion: "Toma la foto con más luz." }],
  ayuda: { whatsapp: "593991234567", telefonos: [] }, avisoNotarial: "El acto se celebra ante el notario, en la notaría." };

async function simularCuenta(page, { sinSesionInicial = false } = {}) {
  const pedidos = [];
  let sinSesion = sinSesionInicial;
  await page.route("**/api/cuenta**", async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() === "GET") {
      const accion = u.searchParams.get("accion");
      if (accion === "yo" && sinSesion) return route.fulfill({ status: 401, json: { error: "Inicia sesión para continuar." } });
      if (accion === "yo") return route.fulfill({ json: { cliente } });
      if (accion === "tramites") return route.fulfill({ json: { tramites: [item] } });
      if (accion === "tramite") return route.fulfill({ json: { tramite: detalle } });
    }
    const b = route.request().postDataJSON(); pedidos.push(b);
    if (b.accion === "pedirCodigo") return route.fulfill({ status: 202, json: { mensaje: "Si el correo es válido, te enviamos un código." } });
    if (b.accion === "verificar") { sinSesion = false; return route.fulfill({ json: { cliente, perfilCompleto: true } }); }
    if (b.accion === "vincular") return route.fulfill({ json: { id: item.id } });
    if (b.accion === "subirDocumento") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: { cliente, ok: true } });
  });
  return pedidos;
}

test("entra con código y guarda el trámite usando el vínculo de un solo uso", async ({ page }) => {
  const pedidos = await simularCuenta(page, { sinSesionInicial: true });
  const token = "a".repeat(43);
  await page.goto("/cuenta.html#vincular=" + token);
  await page.getByLabel("Correo electrónico").fill("ana@example.test");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByText("Si el correo es válido, te enviamos un código.")).toBeVisible();
  await page.getByLabel("Código de seis dígitos").fill("123456");
  await page.getByRole("button", { name: "Entrar a Mis trámites" }).click();
  await expect(page).toHaveURL(/mis-tramites\.html\?id=tramite-1/);
  await expect(page.getByRole("heading", { name: "Poder especial" })).toBeVisible();
  expect(pedidos).toEqual(expect.arrayContaining([{ accion: "pedirCodigo", email: "ana@example.test" }, { accion: "verificar", email: "ana@example.test", codigo: "123456" }, { accion: "vincular", token }]));
});

test("muestra el siguiente paso y la observación pública, nunca una nota interna", async ({ page }) => {
  await simularCuenta(page);
  await page.goto("/mis-tramites.html");
  await expect(page.getByRole("button", { name: /Poder especial/ })).toContainText("Documentos por corregir");
  await page.getByRole("button", { name: /Poder especial/ }).click();
  await expect(page.getByText("Toma la foto con más luz.")).toBeVisible();
  await expect(page.getByText("La foto está borrosa.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("NOTA INTERNA");
});

test("el portal conserva una sola columna legible en móvil @movil", async ({ page }) => {
  await simularCuenta(page);
  await page.goto("/mis-tramites.html?id=tramite-1");
  await expect(page.getByRole("heading", { name: "Poder especial" })).toBeVisible();
  const bloques = page.locator(".detalle__bloque");
  expect((await bloques.nth(1).boundingBox()).x).toBe((await bloques.nth(0).boundingBox()).x);
});
