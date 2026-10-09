import { test, expect, abrirPortada, datos, notaria, tramite } from "./fixtures.js";

// Lista de los más pedidos que dio el notario, en su orden.
const DESTACADOS = ["compraventa-vehiculo", "declaracion-natural", "poder-natural", "salida-pais", "copias-certificadas", "certificacion-electronica", "posesion-efectiva", "disolucion-sociedad-conyugal", "divorcio"];
const items = (page) => page.locator("#lista .tl__item");
const detalle = (page) => page.locator("#detalleTramite");
const pestana = (page, nombre) => page.locator("#chips .tab", { hasText: nombre });

test.describe("Catálogo de trámites", () => {
  test("CF-10 la pestaña inicial muestra los trámites más pedidos según el notario, en orden", async ({ page }) => {
    await abrirPortada(page);
    await expect(pestana(page, "Más pedidos")).toHaveAttribute("aria-pressed", "true");
    await expect(items(page).locator("span:first-child")).toHaveText(DESTACADOS.map((id) => tramite(id).nombre));
  });

  test("CF-11 el primer trámite de la lista se abre en el detalle por defecto", async ({ page }) => {
    await abrirPortada(page);
    await expect(items(page).first()).toHaveAttribute("aria-current", "true");
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(tramite("compraventa-vehiculo").nombre);
  });

  test("CF-12 cada pestaña de categoría filtra solo sus trámites", async ({ page }) => {
    await abrirPortada(page);
    for (const c of datos.categorias) {
      await pestana(page, c.nombre).click();
      await expect(pestana(page, c.nombre)).toHaveAttribute("aria-pressed", "true");
      const esperados = datos.tramites.filter((t) => t.cat === c.id).map((t) => t.nombre);
      await expect(items(page).locator("span:first-child")).toHaveText(esperados);
    }
  });

  test("CF-13 la sección Servicios muestra cada área con su número de trámites", async ({ page }) => {
    await abrirPortada(page);
    const filas = page.locator("#categorias .svc__row");
    await expect(filas).toHaveCount(datos.categorias.length);
    const poderes = datos.tramites.filter((t) => t.cat === "poderes").length;
    await expect(filas.first().locator(".svc__count")).toHaveText(`${poderes} trámites`);
  });

  test("CF-14 elegir un área en Servicios lleva a Trámites filtrado por esa área", async ({ page }) => {
    await abrirPortada(page);
    await page.locator("#categorias .svc__row", { hasText: "Herencias y testamentos" }).click();
    await expect(pestana(page, "Herencias y testamentos")).toHaveAttribute("aria-pressed", "true");
    await expect(items(page)).toHaveCount(datos.tramites.filter((t) => t.cat === "herencias").length);
    await expect(page.locator("#tramites")).toBeInViewport();
  });

  test("CF-15 al elegir un trámite se muestra su detalle y se actualiza la URL", async ({ page }) => {
    await abrirPortada(page);
    await items(page).filter({ hasText: tramite("divorcio").nombre }).click();
    const t = tramite("divorcio");
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(t.nombre);
    await expect(detalle(page).locator(".tp__cat")).toHaveText("Familia");
    await expect(detalle(page).locator(".check li")).toHaveCount(t.req.length);
    await expect(detalle(page).locator(".pasos li")).toHaveCount(t.pasos.length);
    await expect(detalle(page).locator(".nota")).toHaveText(t.nota);
    await expect(page).toHaveURL(/#t-divorcio$/);
  });

  test("CF-16 los precios se muestran con formato de dólar ecuatoriano + IVA", async ({ page }) => {
    await abrirPortada(page);
    // 12% del SBU 2026 ($482) = $57,84
    await expect(items(page).filter({ hasText: tramite("poder-natural").nombre }).locator(".tl__precio")).toHaveText("$57,84 + IVA");
    await expect(items(page).filter({ hasText: "Copias certificadas" }).locator(".tl__precio")).toHaveText("$1,79 + IVA por hoja");
    await page.fill("#buscar", "Compraventa de inmuebles");
    await expect(items(page).filter({ hasText: "Compraventa de inmuebles" }).locator(".tl__precio")).toHaveText("Según cuantía");
  });

  test("CF-17 un trámite con tarifa 'Consultar' no ofrece calcular costo", async ({ page }) => {
    await abrirPortada(page, "/#t-arrendamiento");
    await expect(detalle(page).locator(".tp__precio strong")).toHaveText("Consultar");
    await expect(detalle(page).locator("[data-calc]")).toHaveCount(0);
  });
});

test.describe("Buscador", () => {
  test("CF-20 encuentra trámites por nombre", async ({ page }) => {
    await abrirPortada(page);
    await page.fill("#buscar", "divorcio");
    await expect(items(page).filter({ hasText: tramite("divorcio").nombre })).toBeVisible();
    await expect(page.locator('#chips .tab[aria-pressed="true"]')).toHaveCount(0);
  });

  test("CF-21 ignora tildes y mayúsculas", async ({ page }) => {
    await abrirPortada(page);
    await page.fill("#buscar", "POSESION");
    await expect(items(page).filter({ hasText: "Posesión efectiva" })).toBeVisible();
  });

  test("CF-22 también busca dentro de los requisitos", async ({ page }) => {
    await abrirPortada(page);
    const req = tramite("salida-pais").req[0].split(" ").slice(0, 3).join(" ");
    await page.fill("#buscar", req);
    await expect(items(page).filter({ hasText: tramite("salida-pais").nombre })).toBeVisible();
  });

  test("CF-23 sin resultados muestra el mensaje de ayuda y oculta la lista", async ({ page }) => {
    await abrirPortada(page);
    await page.fill("#buscar", "zzzz trámite inexistente");
    await expect(page.locator("#vacio")).toBeVisible();
    await expect(page.locator("#tramitesUi")).toBeHidden();
  });

  test("CF-24 al borrar la búsqueda vuelve la pestaña 'Más pedidos'", async ({ page }) => {
    await abrirPortada(page);
    await page.fill("#buscar", "hipoteca");
    await page.fill("#buscar", "");
    await expect(pestana(page, "Más pedidos")).toHaveAttribute("aria-pressed", "true");
    await expect(items(page)).toHaveCount(DESTACADOS.length);
  });

  test("CF-25 elegir una pestaña limpia la búsqueda", async ({ page }) => {
    await abrirPortada(page);
    await page.fill("#buscar", "hipoteca");
    await pestana(page, "Empresas").click();
    await expect(page.locator("#buscar")).toHaveValue("");
    await expect(items(page)).toHaveCount(datos.tramites.filter((t) => t.cat === "empresas").length);
  });
});

test.describe("Detalle del trámite", () => {
  test("CF-30 los requisitos marcados se recuerdan al recargar la página", async ({ page }) => {
    await abrirPortada(page, "/#t-divorcio");
    const casillas = detalle(page).locator(".check input");
    await casillas.nth(0).check();
    await casillas.nth(2).check();
    await page.reload();
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(tramite("divorcio").nombre);
    await expect(casillas.nth(0)).toBeChecked();
    await expect(casillas.nth(1)).not.toBeChecked();
    await expect(casillas.nth(2)).toBeChecked();
  });

  test("CF-31 los botones de WhatsApp llevan el número y el nombre del trámite", async ({ page }) => {
    await abrirPortada(page, "/#t-divorcio");
    const consultar = detalle(page).getByRole("link", { name: "Consultar por WhatsApp" });
    const href = await consultar.getAttribute("href");
    expect(href).toMatch(new RegExp("^https://wa\\.me/" + notaria.whatsapp + "\\?text="));
    expect(decodeURIComponent(href.split("text=")[1])).toBe("Hola, quiero información sobre el trámite: " + tramite("divorcio").nombre);
    await expect(consultar).toHaveAttribute("target", "_blank");
    await expect(detalle(page).getByRole("link", { name: "Agendar cita" })).toHaveAttribute("href", "cita.html?tramite=divorcio");
    await expect(detalle(page).getByRole("link", { name: "Enviar documentos" })).toHaveAttribute("href", /revisi%C3%B3n%20previa/);
  });

  test("CF-32 'Calcular costo' lleva a la calculadora con el trámite elegido", async ({ page }) => {
    await abrirPortada(page, "/#t-divorcio");
    await detalle(page).getByRole("button", { name: "Calcular costo" }).click();
    await expect(page.locator("#calcTramite")).toHaveValue("divorcio");
    await expect(page.locator("#rTotal")).toHaveText("$216,18");
    await expect(page.locator("#calculadora")).toBeInViewport();
  });

  test("CF-33 'Compartir' envía nombre, requisitos y enlace directo", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = (d) => { window.__compartido = d; return Promise.resolve(); };
    });
    await abrirPortada(page, "/#t-divorcio");
    await detalle(page).getByRole("button", { name: "Compartir" }).click();
    const d = await page.evaluate(() => window.__compartido);
    const t = tramite("divorcio");
    expect(d.title).toBe(t.nombre);
    expect(d.text).toContain("• " + t.req[0]);
    expect(d.text).toMatch(/#t-divorcio$/);
  });

  test("CF-34 sin navigator.share, 'Compartir' abre WhatsApp", async ({ page, context }) => {
    await page.addInitScript(() => { delete Navigator.prototype.share; });
    await abrirPortada(page, "/#t-divorcio");
    const [pedido] = await Promise.all([
      context.waitForEvent("request", (r) => r.url().includes("wa.me")),
      detalle(page).getByRole("button", { name: "Compartir" }).click()
    ]);
    expect(pedido.url()).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(pedido.url())).toContain(tramite("divorcio").nombre);
  });

  test("CF-35 'Imprimir' abre el diálogo de impresión", async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.__impreso = document.body.dataset.print; }; });
    await abrirPortada(page, "/#t-divorcio");
    await detalle(page).getByRole("button", { name: "Imprimir" }).click();
    expect(await page.evaluate(() => window.__impreso)).toBe("1");
  });
});

test.describe("Enlaces directos a trámites", () => {
  test("CF-40 /#t-<id> de un trámite destacado abre 'Más pedidos'", async ({ page }) => {
    await abrirPortada(page, "/#t-salida-pais");
    await expect(pestana(page, "Más pedidos")).toHaveAttribute("aria-pressed", "true");
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(tramite("salida-pais").nombre);
  });

  test("CF-41 /#t-<id> de otro trámite abre su categoría", async ({ page }) => {
    await abrirPortada(page, "/#t-hipoteca");
    await expect(pestana(page, "Escrituras e inmuebles")).toHaveAttribute("aria-pressed", "true");
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(tramite("hipoteca").nombre);
    await expect(page.locator("#tramites")).toBeInViewport();
  });

  test("CF-42 un enlace a un trámite inexistente deja la portada normal", async ({ page }) => {
    await abrirPortada(page, "/#t-no-existe");
    await expect(pestana(page, "Más pedidos")).toHaveAttribute("aria-pressed", "true");
  });

  test("CF-43 cambiar el hash con la página abierta cambia el trámite", async ({ page }) => {
    await abrirPortada(page);
    await page.evaluate(() => { location.hash = "#t-constitucion-compania"; });
    await expect(detalle(page).locator(".tp__nombre")).toHaveText(tramite("constitucion-compania").nombre);
    await expect(pestana(page, "Empresas")).toHaveAttribute("aria-pressed", "true");
  });

  test("CF-150 al imprimir en la computadora se ve el detalle completo del trámite", async ({ page }) => {
    await abrirPortada(page);
    await page.locator("#lista .tl__item").nth(1).click();
    await page.evaluate(() => { document.body.dataset.print = "1"; });
    await page.emulateMedia({ media: "print" });
    await page.setViewportSize({ width: 760, height: 1000 });   // al imprimir, el ancho es el del papel
    const hoja = page.locator("#detalleTramite");
    await expect(hoja.locator(".tp__nombre")).toBeVisible();
    await expect(hoja).toHaveCSS("transform", "none");
    await expect(hoja.locator(".tp__cerrar")).toBeHidden();
  });
});
