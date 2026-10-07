import { test, expect, notaria, simularApi, respuestaRetenida } from "./fixtures.js";

const mensajes = (page, autor) => page.locator("#mensajes .ac-msg--" + autor);
const historial = (page) => page.locator("#historial .ac-item");
// Los cinco trámites más pedidos según el notario: caso real, trámite y la pregunta completa que se envía.
const TARJETAS = [
  ["Voy a vender mi carro", "Compraventa de vehículos", "Voy a vender mi carro, ¿qué necesito en la notaría?"],
  ["Necesito una declaración juramentada", "Declaraciones juramentadas", "Necesito hacer una declaración juramentada, ¿qué debo llevar?"],
  ["Necesito que alguien firme por mí", "Poderes", "Necesito que alguien haga un trámite y firme por mí, ¿qué poder necesito?"],
  ["Mi hijo menor va a viajar al exterior", "Autorización de salida del país", "Mi hijo menor de edad va a viajar al exterior, ¿qué permiso necesita?"],
  ["Necesito copias certificadas o materializar un documento electrónico", "Copias certificadas y materializaciones", "Necesito copias certificadas de un documento o materializar un documento electrónico, ¿cómo lo hago y cuánto cuesta?"]
];

async function escribir(page, texto) {
  await page.fill("#texto", texto);
  await page.keyboard.press("Enter");
}

test.describe("Asistente a pantalla completa", () => {
  test("CF-130 carga con la pantalla de inicio, historial vacío y foco en el campo", async ({ page }) => {
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto("/asistente.html");
    await expect(page.locator("h1")).toHaveText("¿En qué te ayudo hoy?");
    await expect(page.locator("#tarjetas button")).toHaveCount(5);
    await expect(page.locator("#historial")).toHaveText("Tus conversaciones aparecerán aquí.");
    await expect(page.locator("#texto")).toBeFocused();
    expect(errores).toEqual([]);
  });

  test("CF-131 el botón Enviar solo se habilita con texto", async ({ page }) => {
    await page.goto("/asistente.html");
    await expect(page.locator("#enviar")).toBeDisabled();
    await page.fill("#texto", "   ");
    await expect(page.locator("#enviar")).toBeDisabled();
    await page.fill("#texto", "Hola");
    await expect(page.locator("#enviar")).toBeEnabled();
  });

  test("CF-132 una tarjeta envía su pregunta y la conversación aparece en el historial", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["Para vender tu carro trae la matrícula."] } }));
    await page.goto("/asistente.html");
    const [titulo, , pregunta] = TARJETAS[0];
    await page.locator("#tarjetas button", { hasText: titulo }).click();
    await expect(mensajes(page, "cliente")).toHaveText([pregunta]);
    await expect(mensajes(page, "asistente").locator(".ac-texto")).toHaveText(["Para vender tu carro trae la matrícula."]);
    await expect(page.locator("#inicio")).toBeHidden();
    await expect(historial(page)).toHaveCount(1);
    await expect(historial(page).first()).toContainText(pregunta);
    await expect(page.locator("#historial .ac-grupo")).toHaveText(["Hoy"]);
    expect(pedidos[0].texto).toBe(pregunta);
  });

  test("CF-141 las tarjetas son los 5 trámites más pedidos del notario, en orden, y cada una envía su pregunta completa", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["ok"] } }));
    await page.goto("/asistente.html");
    const tarjetas = page.locator("#tarjetas button");
    await expect(tarjetas.locator("b")).toHaveText(TARJETAS.map((t) => t[0]));
    await expect(tarjetas.locator("span")).toHaveText(TARJETAS.map((t) => t[1]));
    for (let i = 0; i < TARJETAS.length; i++) {
      await page.getByRole("button", { name: "Nueva conversación" }).first().click();
      await expect(page.locator("#inicio")).toBeVisible();
      await tarjetas.nth(i).click();
      await expect(mensajes(page, "cliente")).toHaveText([TARJETAS[i][2]]);
      await expect.poll(() => pedidos.length).toBe(i + 1);
      expect(pedidos[i].texto).toBe(TARJETAS[i][2]);
    }
  });

  for (const [id, etiqueta] of [["CF-142", ""], ["CF-143", " @movil"]]) {
    test(id + " la pantalla de inicio cabe sin esconder el campo de texto" + etiqueta, async ({ page }) => {
      await page.goto("/asistente.html");
      await expect(page.locator("#tarjetas button").last()).toBeInViewport({ ratio: 1 });
      await expect(page.locator("#texto")).toBeInViewport({ ratio: 1 });
    });
  }

  test("CF-133 se puede volver a una conversación anterior desde el historial", async ({ page }) => {
    await simularApi(page, (b) => ({ json: { respuestas: ["respuesta a: " + b.texto] } }));
    await page.goto("/asistente.html");
    await escribir(page, "Conversación A");
    await expect(mensajes(page, "asistente")).toHaveCount(1);
    await page.getByRole("button", { name: "Nueva conversación" }).first().click();
    await expect(page.locator("#inicio")).toBeVisible();
    await escribir(page, "Conversación B");
    await expect(historial(page)).toHaveCount(2);
    await page.locator("#historial [data-s]", { hasText: "Conversación A" }).click();
    await expect(mensajes(page, "cliente")).toHaveText(["Conversación A"]);
    await expect(page.locator("#historial .ac-item--on")).toContainText("Conversación A");
  });

  test("CF-134 borrar una conversación pide confirmación y la quita del historial", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ["ok"] } }));
    await page.goto("/asistente.html");
    await escribir(page, "Para borrar");
    await expect(historial(page)).toHaveCount(1);

    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Borrar conversación" }).click();
    await expect(historial(page)).toHaveCount(1);

    page.once("dialog", (d) => { expect(d.message()).toContain("¿Borrar esta conversación"); d.accept(); });
    await page.getByRole("button", { name: "Borrar conversación" }).click();
    await expect(historial(page)).toHaveCount(0);
    await expect(page.locator("#inicio")).toBeVisible();
  });

  test("CF-135 comparte las conversaciones con la burbuja de la portada", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ["Respuesta compartida"] } }));
    await page.goto("/");
    await page.locator("#chatAbrir").click();
    await page.fill("#chatTexto", "Empecé en la portada");
    await page.keyboard.press("Enter");
    await expect(page.locator("#chatMensajes .chat__msg--asistente").last()).toHaveText("Respuesta compartida");
    await page.goto("/asistente.html");
    await expect(mensajes(page, "cliente")).toHaveText(["Empecé en la portada"]);
  });

  test("CF-136 muestra los errores del servidor como aviso", async ({ page }) => {
    await simularApi(page, () => ({ status: 429, json: { error: "Demasiados mensajes." } }));
    await page.goto("/asistente.html");
    await escribir(page, "Hola");
    await expect(mensajes(page, "aviso")).toHaveText("Demasiados mensajes.");
  });

  test("CF-137 'Copiar respuesta' copia el texto original al portapapeles", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await simularApi(page, () => ({ json: { respuestas: ["Trae tu *cédula*."] } }));
    await page.goto("/asistente.html");
    await escribir(page, "¿Qué llevo?");
    await page.getByRole("button", { name: "Copiar respuesta" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Trae tu *cédula*.");
  });

  test("CF-138 enlaza a WhatsApp, a la portada y al aviso de privacidad", async ({ page }) => {
    await page.goto("/asistente.html");
    await expect(page.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute("href", "https://wa.me/" + notaria.whatsapp);
    await expect(page.getByRole("link", { name: "Volver a la página" })).toHaveAttribute("href", "./");
    await expect(page.getByRole("link", { name: "Aviso de privacidad" })).toHaveAttribute("href", "privacidad.html");
  });

  test("CF-139 una respuesta que llega tras cambiar de conversación no se mezcla", async ({ page }) => {
    const retenida = respuestaRetenida({ respuestas: ["respuesta de la conversación vieja"] });
    await simularApi(page, retenida.responder);
    await page.goto("/asistente.html");
    await escribir(page, "pregunta vieja");
    await expect(page.locator(".ac-pensando")).toBeVisible();
    await page.getByRole("button", { name: "Nueva conversación" }).first().click();
    retenida.soltar();
    await page.waitForTimeout(300);
    await expect(page.locator("#mensajes")).not.toContainText("respuesta de la conversación vieja");
    await page.locator("#historial [data-s]", { hasText: "pregunta vieja" }).click();
    await expect(mensajes(page, "asistente")).toContainText("respuesta de la conversación vieja");
  });

  test("CF-140 @movil el menú lateral se abre y se cierra tocando fuera", async ({ page }) => {
    await page.goto("/asistente.html");
    await page.getByRole("button", { name: "Abrir el menú" }).click();
    await expect(page.locator("body")).toHaveClass(/ac--lado/);
    await expect(page.locator("#velo")).toBeVisible();
    await page.locator("#velo").click({ position: { x: 350, y: 300 } });
    await expect(page.locator("body")).not.toHaveClass(/ac--lado/);
  });
});
