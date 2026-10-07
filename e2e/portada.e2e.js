import { test, expect, abrirPortada, datos, notaria } from "./fixtures.js";

// Instantes en UTC; Quito es UTC-5 todo el año.
const QUITO = (fechaHora) => new Date(fechaHora + "-05:00");

test.describe("Contacto y datos de la notaría", () => {
  test("CF-70 la portada destaca al notario: cargo, nombre y lema desde los datos", async ({ page }) => {
    await abrirPortada(page);
    await expect(page).toHaveTitle(notaria.notarioCorto + " · " + notaria.nombre);
    await expect(page.locator("#brandName")).toHaveText(notaria.notarioCorto);
    await expect(page.locator("#brandSub")).toHaveText("Notaría 41 · Quito");
    await expect(page.locator("#heroNotario")).toHaveText(notaria.cargo);
    await expect(page.locator("#heroTitle")).toHaveText(notaria.notario);
    await expect(page.locator("#heroLema")).toHaveText(notaria.eslogan);
    expect(notaria.eslogan).toBe("Fe pública al servicio de la comunidad.");
    await expect(page.locator(".hero")).not.toContainText("Prepara tu trámite por WhatsApp");
  });

  test("CF-70b el HTML ya trae cargo, nombre y lema antes de cargar los datos", async ({ page }) => {
    await page.route("**/data/notaria.json", () => {});
    await page.goto("/");
    await expect(page.locator("#heroNotario")).toHaveText("Notario Cuadragésimo Primero del Cantón Quito");
    await expect(page.locator("#heroTitle")).toHaveText("Dr. Dobri Miguel Albornoz Donoso");
    await expect(page.locator("#heroLema")).toHaveText("Fe pública al servicio de la comunidad.");
    await expect(page.locator("#brandName")).toHaveText("Dr. Dobri Albornoz Donoso");
    await expect(page).toHaveTitle("Dr. Dobri Albornoz Donoso · Notaría 41 de Quito");
  });

  test("CF-70c @movil el nombre del notario cabe en la portada sin cortar palabras", async ({ page }) => {
    await abrirPortada(page);
    const h1 = page.locator("#heroTitle");
    const m = await h1.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.1;
      return { lineas: Math.round(el.getBoundingClientRect().height / lh), desborda: el.scrollWidth > el.clientWidth + 1 };
    });
    expect(m.desborda).toBe(false);
    expect(m.lineas).toBeLessThanOrEqual(3);
  });

  test("CF-71 teléfonos y correo son enlaces que se pueden pulsar", async ({ page }) => {
    await abrirPortada(page);
    const info = page.locator("#contactInfo");
    await expect(info.getByRole("link", { name: "02 600 1141" })).toHaveAttribute("href", "tel:+59326001141");
    await expect(info.getByRole("link", { name: "02 600 4141" })).toHaveAttribute("href", "tel:+59326004141");
    await expect(info.getByRole("link", { name: notaria.correo })).toHaveAttribute("href", "mailto:" + notaria.correo);
    await expect(info).toContainText(notaria.direccion);
    await expect(info).toContainText(notaria.horario.texto);
  });

  test("CF-72 'Cómo llegar', Waze y el mapa apuntan a la ubicación de la notaría", async ({ page }) => {
    await abrirPortada(page);
    const { lat, lng } = notaria.mapa;
    await expect(page.getByRole("link", { name: "Cómo llegar" })).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    await expect(page.getByRole("link", { name: "Abrir en Waze" })).toHaveAttribute("href", new RegExp(`ll=${lat},${lng}`));
    await expect(page.locator("#mapa")).toHaveAttribute("src", new RegExp(`openstreetmap.*marker=${lat}%2C${lng}`));
  });

  test("CF-73 enlaza solo las redes sociales configuradas", async ({ page }) => {
    await abrirPortada(page);
    const redes = page.locator("#contactInfo .social a");
    await expect(redes).toHaveText(["Facebook"]);
    await expect(redes.first()).toHaveAttribute("href", notaria.redes.facebook);
  });

  test("CF-74 publica datos estructurados schema.org de tipo Notary", async ({ page }) => {
    await abrirPortada(page);
    const ld = JSON.parse(await page.locator("#ld").textContent());
    expect(ld["@type"]).toBe("Notary");
    expect(ld.telephone).toBe("+59326001141");
    expect(ld.openingHoursSpecification.dayOfWeek).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  });

  test("CF-75 el pie muestra el año en curso", async ({ page }) => {
    await page.clock.setFixedTime(QUITO("2027-03-10T10:00:00"));
    await abrirPortada(page);
    await expect(page.locator("#footTxt")).toHaveText(`© 2027 ${notaria.nombre} · ${notaria.notario}`);
  });
});

test.describe("Estado abierto / cerrado", () => {
  const casos = [
    ["lunes 10:00", "2026-10-05T10:00:00", "Abierto ahora · cierra a las 17:00"],
    ["lunes 08:00 (apertura)", "2026-10-05T08:00:00", "Abierto ahora"],
    ["lunes 07:59", "2026-10-05T07:59:00", "Cerrado ahora"],
    ["viernes 16:59", "2026-10-09T16:59:00", "Abierto ahora"],
    ["viernes 17:00 (cierre)", "2026-10-09T17:00:00", "Cerrado ahora · " + notaria.horario.texto],
    ["sábado 10:00", "2026-10-10T10:00:00", "Cerrado ahora"],
    ["domingo 10:00", "2026-10-11T10:00:00", "Cerrado ahora"]
  ];
  for (const [nombre, hora, esperado] of casos) {
    test(`CF-76 ${nombre} en Quito → "${esperado}"`, async ({ page }) => {
      await page.clock.setFixedTime(QUITO(hora));
      await abrirPortada(page);
      await expect(page.locator("#estado")).toContainText(esperado);
    });
  }

  test.describe("visitante fuera de Ecuador", () => {
    test.use({ timezoneId: "Europe/Madrid" });
    test("CF-77 el estado usa la hora de Quito, no la del visitante", async ({ page }) => {
      await page.clock.setFixedTime(QUITO("2026-10-05T10:00:00"));
      await abrirPortada(page);
      await expect(page.locator("#estado")).toContainText("Abierto ahora");
    });
  });
});

test.describe("Avisos temporales", () => {
  const conAvisos = (avisos) => async (route) => {
    const r = await route.fetch();
    route.fulfill({ response: r, json: { ...(await r.json()), avisos } });
  };

  test("CF-80 sin avisos vigentes la barra de aviso no aparece", async ({ page }) => {
    await abrirPortada(page);
    await expect(page.locator("#aviso")).toBeHidden();
  });

  test("CF-81 muestra solo los avisos dentro de su rango de fechas", async ({ page }) => {
    await page.clock.setFixedTime(QUITO("2026-11-01T10:00:00"));
    await page.route("**/data/tramites.json", conAvisos([
      { msg: "Feriado: cerrado el 2 de noviembre", desde: "2026-10-28", hasta: "2026-11-02" },
      { msg: "Aviso vencido", desde: "2026-01-01", hasta: "2026-01-31" },
      { msg: "Aviso futuro", desde: "2026-12-01", hasta: "" }
    ]));
    await abrirPortada(page);
    await expect(page.locator("#avisoTxt")).toHaveText("Feriado: cerrado el 2 de noviembre");
  });

  test("CF-82 un aviso cerrado no vuelve a aparecer en la misma sesión", async ({ page }) => {
    await page.route("**/data/tramites.json", conAvisos([{ msg: "Horario especial", desde: "", hasta: "" }]));
    await abrirPortada(page);
    await page.getByRole("button", { name: "Cerrar aviso" }).click();
    await expect(page.locator("#aviso")).toBeHidden();
    await page.reload();
    await expect(page.locator("#lista .tl__item").first()).toBeVisible();
    await expect(page.locator("#aviso")).toBeHidden();
  });
});

test.describe("Carga de datos", () => {
  test("CF-85 si los datos no cargan, avisa al usuario en vez de quedar en blanco", async ({ page }) => {
    await page.route("**/data/tramites.json", (r) => r.fulfill({ status: 500, body: "" }));
    await page.goto("/");
    await expect(page.getByText("No se pudieron cargar los datos")).toBeVisible();
  });

  test("CF-86 con la hoja de Google sin pestañas configuradas usa los datos locales", async ({ page }) => {
    const pedidos = [];
    page.on("request", (r) => pedidos.push(r.url()));
    await abrirPortada(page);
    expect(pedidos.some((u) => u.includes("docs.google.com"))).toBe(false);
    await expect(page.locator("#categorias .svc__row")).toHaveCount(datos.categorias.length);
  });

  test("CF-87 la portada carga sin errores de JavaScript", async ({ page }) => {
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await abrirPortada(page);
    expect(errores).toEqual([]);
  });
});

test.describe("Navegación", () => {
  test("CF-90 cada enlace del menú lleva a su sección", async ({ page }) => {
    await abrirPortada(page);
    for (const id of ["servicios", "tramites", "calculadora", "faq", "contacto"]) {
      await page.locator(`#menu a[href="#${id}"]`).click();
      await expect(page.locator("#" + id)).toBeInViewport();
    }
  });

  test("CF-91 el enlace 'Saltar al contenido' es el primer elemento con foco", async ({ page }) => {
    await abrirPortada(page);
    await page.keyboard.press("Tab");
    await expect(page.locator("a.skip")).toBeFocused();
    await expect(page.locator("a.skip")).toHaveAttribute("href", "#main");
  });

  test("CF-92 las preguntas frecuentes se muestran completas", async ({ page }) => {
    await abrirPortada(page);
    await expect(page.locator("#faqList .faq__item h3")).toHaveText(datos.faq.map((f) => f.q));
  });

  test("CF-93 la página tiene un solo h1 y todas las imágenes tienen alt", async ({ page }) => {
    await abrirPortada(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("img:not([alt])")).toHaveCount(0);
  });

  test("CF-94 @movil el menú hamburguesa abre y se cierra al elegir una sección", async ({ page }) => {
    await abrirPortada(page);
    const burger = page.locator("#burger"), menu = page.locator("#menu");
    await expect(menu).toHaveCSS("opacity", "0");
    await burger.click();
    await expect(burger).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveCSS("opacity", "1");
    await page.locator('#menu a[href="#contacto"]').click();
    await expect(burger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).not.toHaveClass(/open/);
    await expect(page.locator("#contacto")).toBeInViewport();
  });

  test("CF-97 @movil con el menú cerrado, Tab no pasa por los enlaces invisibles", async ({ page }) => {
    await abrirPortada(page);
    // Orden de foco: "Saltar al contenido", logo y luego lo que siga.
    for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
    await expect(page.locator("#menu a:focus")).toHaveCount(0);
  });

  test("CF-95 @movil Escape cierra el menú y lo anuncia como cerrado", async ({ page }) => {
    await abrirPortada(page);
    await page.locator("#burger").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu")).not.toHaveClass(/open/);
    await expect(page.locator("#burger")).toHaveAttribute("aria-expanded", "false");
  });

  test("CF-96 @movil elegir un trámite abre su detalle como hoja que se cierra con la X o Escape", async ({ page }) => {
    await abrirPortada(page);
    await page.locator("#lista .tl__item").nth(5).click();
    const hoja = page.locator("#detalleTramite");
    await expect(hoja).toHaveAttribute("role", "dialog");
    await expect(hoja.locator(".tp__nombre")).toBeInViewport();
    await expect(hoja.locator("[data-cerrar]")).toBeFocused();
    await hoja.locator("[data-cerrar]").click();
    await expect(hoja).not.toHaveClass(/tp--abierto/);
    await page.locator("#lista .tl__item").nth(2).click();
    await expect(hoja).toHaveClass(/tp--abierto/);
    await page.keyboard.press("Escape");
    await expect(hoja).not.toHaveClass(/tp--abierto/);
  });

  test("CF-151 @movil las preguntas están en acordeón y quedan abiertas al pasar a pantalla ancha", async ({ page }) => {
    await abrirPortada(page);
    const preguntas = page.locator("#faqList details");
    await expect(preguntas.first()).not.toHaveAttribute("open", "");
    await preguntas.first().locator("summary").click();
    await expect(preguntas.first()).toHaveAttribute("open", "");
    await page.setViewportSize({ width: 1100, height: 800 });
    for (const d of await preguntas.all()) await expect(d).toHaveAttribute("open", "");
  });
});

test.describe("Páginas secundarias", () => {
  test("CF-100 el aviso de privacidad abre desde el pie y permite volver", async ({ page }) => {
    await abrirPortada(page);
    await page.locator("footer").getByRole("link", { name: "Aviso de privacidad" }).click();
    await expect(page.locator("h1")).toHaveText("Aviso de privacidad");
    await expect(page.getByRole("link", { name: notaria.correo }).first()).toHaveAttribute("href", "mailto:" + notaria.correo);
    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await expect(page.locator("#lista .tl__item").first()).toBeVisible();
  });

  test("CF-101 la página 404 ofrece volver al inicio y a trámites", async ({ page }) => {
    await page.goto("/404.html");
    await expect(page.locator("h1")).toHaveText("Esta página no existe.");
    await expect(page.getByRole("link", { name: "Ver trámites" })).toHaveAttribute("href", "/#tramites");
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  test("CF-102 el manifiesto y los íconos existen", async ({ request }) => {
    for (const ruta of ["/manifest.webmanifest", "/assets/logo/icono-512.png", "/assets/favicon.svg", "/robots.txt"]) {
      expect((await request.get(ruta)).status(), ruta).toBe(200);
    }
  });
});
