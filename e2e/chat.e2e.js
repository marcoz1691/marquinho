import { test, expect, notaria, simularApi, respuestaRetenida } from "./fixtures.js";

const BIENVENIDA = "Hola, soy Sofía. Respondo de forma automática por la Notaría 41";
const chat = (page) => page.locator("#chat");
const mensajes = (page, autor) => page.locator("#chatMensajes .chat__msg--" + autor);

async function abrirChat(page) {
  await page.goto("/");
  await page.locator("#chatAbrir").click();
  await expect(chat(page)).toBeVisible();
}

async function escribir(page, texto) {
  await page.fill("#chatTexto", texto);
  await page.keyboard.press("Enter");
}

test.describe("Chat del asistente", () => {
  test("CF-110 el botón '¿Te ayudo?' abre el chat con bienvenida y sugerencias", async ({ page }) => {
    await abrirChat(page);
    await expect(page.locator("#chatAbrir")).toHaveAttribute("aria-expanded", "true");
    await expect(mensajes(page, "asistente").first()).toContainText(BIENVENIDA);
    await expect(page.locator("#chatSugerencias .chat__sug")).toHaveCount(3);
    await expect(page.locator("#chatTexto")).toBeFocused();
  });

  test("CF-111 enviar un mensaje muestra la pregunta y la respuesta", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["Un poder cuesta $57,84 + IVA."] } }));
    await abrirChat(page);
    await escribir(page, "¿Cuánto cuesta un poder?");
    await expect(mensajes(page, "cliente")).toHaveText(["¿Cuánto cuesta un poder?"]);
    await expect(mensajes(page, "asistente").last()).toHaveText("Un poder cuesta $57,84 + IVA.");
    await expect(page.locator("#chatTexto")).toHaveValue("");
    await expect(page.locator("#chatSugerencias")).toBeHidden();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].texto).toBe("¿Cuánto cuesta un poder?");
    expect(pedidos[0].sesion).toMatch(/^[A-Za-z0-9_-]{12,64}$/);
  });

  test("CF-112 una sugerencia se envía como pregunta", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["Claro."] } }));
    await abrirChat(page);
    await page.locator(".chat__sug", { hasText: "Quiero pedir una cita" }).click();
    await expect(mensajes(page, "cliente")).toHaveText(["Quiero pedir una cita"]);
    expect(pedidos[0].texto).toBe("Quiero pedir una cita");
  });

  test("CF-113 varias respuestas del asistente se muestran como burbujas separadas", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ["Primera parte.", "Segunda parte."] } }));
    await abrirChat(page);
    await escribir(page, "Hola");
    await expect(mensajes(page, "asistente")).toHaveCount(3);
  });

  test("CF-114 da formato a negritas, listas y enlaces de la respuesta", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ["Necesitas *cédula*:\n• Original\n• Copia\nEscríbenos a wa.me/593996530276"] } }));
    await abrirChat(page);
    await escribir(page, "Requisitos");
    const r = mensajes(page, "asistente").last();
    await expect(r.locator("strong")).toHaveText("cédula");
    await expect(r.locator("li")).toHaveText(["Original", "Copia"]);
    await expect(r.locator("a")).toHaveAttribute("href", "https://wa.me/593996530276");
  });

  test("CF-115 el HTML en mensajes y respuestas se muestra como texto (sin XSS)", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ['<img src=x onerror="window.__xss=1">'] } }));
    await abrirChat(page);
    await escribir(page, '<b onclick="x">hola</b>');
    await expect(mensajes(page, "cliente")).toHaveText(['<b onclick="x">hola</b>']);
    await expect(mensajes(page, "asistente").last()).toContainText("<img");
    await expect(page.locator("#chatMensajes img, #chatMensajes b")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("CF-116 no envía mensajes vacíos o solo con espacios", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["x"] } }));
    await abrirChat(page);
    await escribir(page, "   ");
    await page.locator("#chatForm button[type=submit]").click();
    await expect(mensajes(page, "cliente")).toHaveCount(0);
    expect(pedidos).toHaveLength(0);
  });

  test("CF-117 Shift+Enter hace un salto de línea sin enviar", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["ok"] } }));
    await abrirChat(page);
    await page.locator("#chatTexto").pressSequentially("línea 1");
    await page.keyboard.press("Shift+Enter");
    await page.locator("#chatTexto").pressSequentially("línea 2");
    await expect(page.locator("#chatTexto")).toHaveValue("línea 1\nlínea 2");
    expect(pedidos).toHaveLength(0);
  });

  test("CF-118 limita el mensaje a 1000 caracteres", async ({ page }) => {
    await abrirChat(page);
    await expect(page.locator("#chatTexto")).toHaveAttribute("maxlength", "1000");
  });

  test("CF-119 muestra 'escribiendo…' y bloquea un segundo envío mientras espera", async ({ page }) => {
    const retenida = respuestaRetenida({ respuestas: ["listo"] });
    const pedidos = await simularApi(page, retenida.responder);
    await abrirChat(page);
    await escribir(page, "primero");
    await expect(page.locator(".chat__escribiendo")).toBeVisible();
    await escribir(page, "segundo");
    retenida.soltar();
    await expect(mensajes(page, "asistente").last()).toHaveText("listo");
    await expect(page.locator(".chat__escribiendo")).toHaveCount(0);
    expect(pedidos.map((p) => p.texto)).toEqual(["primero"]);
  });

  test("CF-120 si el servidor limita (429) muestra su mensaje de error", async ({ page }) => {
    await simularApi(page, () => ({ status: 429, json: { error: "Por ahora el asistente de la web recibió muchos mensajes." } }));
    await abrirChat(page);
    await escribir(page, "Hola");
    await expect(mensajes(page, "aviso")).toHaveText("Por ahora el asistente de la web recibió muchos mensajes.");
  });

  test("CF-121 un error 500 sin mensaje muestra un error genérico", async ({ page }) => {
    await simularApi(page, () => ({ status: 500, json: {} }));
    await abrirChat(page);
    await escribir(page, "Hola");
    await expect(mensajes(page, "aviso")).toHaveText("No pude responder ahora. Inténtalo de nuevo en unos minutos.");
  });

  test("CF-122 sin conexión avisa que revise su internet", async ({ page }) => {
    await simularApi(page, () => "sin-red");
    await abrirChat(page);
    await escribir(page, "Hola");
    await expect(mensajes(page, "aviso")).toHaveText("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  });

  test("CF-123 la conversación se conserva al recargar la página", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["Respuesta guardada"] } }));
    await abrirChat(page);
    await escribir(page, "Pregunta guardada");
    await expect(mensajes(page, "asistente").last()).toHaveText("Respuesta guardada");
    await page.reload();
    await page.locator("#chatAbrir").click();
    await expect(mensajes(page, "cliente")).toHaveText(["Pregunta guardada"]);
    await expect(mensajes(page, "asistente").last()).toHaveText("Respuesta guardada");
    await expect(page.locator("#chatSugerencias")).toBeHidden();
    await escribir(page, "Otra");
    await expect(mensajes(page, "cliente")).toHaveCount(2);
    expect(pedidos[1].sesion).toBe(pedidos[0].sesion);
  });

  test("CF-124 'Conversación nueva' limpia el chat y usa otra sesión", async ({ page }) => {
    const pedidos = await simularApi(page, () => ({ json: { respuestas: ["ok"] } }));
    await abrirChat(page);
    await escribir(page, "Primera conversación");
    await expect(mensajes(page, "asistente")).toHaveCount(2);
    await page.getByRole("button", { name: "Empezar una conversación nueva" }).click();
    await expect(mensajes(page, "cliente")).toHaveCount(0);
    await expect(page.locator("#chatSugerencias")).toBeVisible();
    await escribir(page, "Segunda conversación");
    await expect(mensajes(page, "asistente")).toHaveCount(2);
    expect(pedidos[1].sesion).not.toBe(pedidos[0].sesion);
  });

  test("CF-125 una respuesta que llega tras 'Conversación nueva' no aparece en la conversación nueva", async ({ page }) => {
    const retenida = respuestaRetenida({ respuestas: ["respuesta de la conversación vieja"] });
    await simularApi(page, retenida.responder);
    await abrirChat(page);
    await escribir(page, "pregunta vieja");
    await expect(page.locator(".chat__escribiendo")).toBeVisible();
    await page.getByRole("button", { name: "Empezar una conversación nueva" }).click();
    retenida.soltar();
    await page.waitForTimeout(300);
    await expect(page.locator("#chatMensajes")).not.toContainText("respuesta de la conversación vieja");
  });

  test("CF-126 Escape y la X cierran el chat y devuelven el foco al botón", async ({ page }) => {
    await abrirChat(page);
    await page.keyboard.press("Escape");
    await expect(chat(page)).toBeHidden();
    await expect(page.locator("#chatAbrir")).toBeFocused();
    await expect(page.locator("#chatAbrir")).toHaveAttribute("aria-expanded", "false");
    await page.locator("#chatAbrir").click();
    await page.getByRole("button", { name: "Cerrar el chat" }).click();
    await expect(chat(page)).toBeHidden();
  });

  test("CF-127 ofrece pasar a WhatsApp con el número de la notaría", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#lista .tl__item").first()).toBeVisible();
    await page.locator("#chatAbrir").click();
    await expect(page.getByRole("link", { name: "Prefiero WhatsApp" })).toHaveAttribute("href", "https://wa.me/" + notaria.whatsapp);
  });

  test("CF-128 el botón 'pantalla completa' abre la página del asistente", async ({ page }) => {
    await abrirChat(page);
    await page.getByRole("link", { name: "Abrir el chat en pantalla completa" }).click();
    await expect(page.locator("h1")).toHaveText("¿En qué te ayudo hoy?");
  });

  test("CF-129 @movil el chat se puede usar en un teléfono", async ({ page }) => {
    await simularApi(page, () => ({ json: { respuestas: ["Hola desde el móvil"] } }));
    await abrirChat(page);
    await escribir(page, "Hola");
    await expect(mensajes(page, "asistente").last()).toBeInViewport();
    await expect(page.locator("#chatTexto")).toBeInViewport();
  });
});
