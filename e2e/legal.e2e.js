import { test, expect } from "./fixtures.js";

// Textos legales: cada página existe, enlaza a las demás y cabe en el celular sin desplazamiento horizontal.
const paginas = [["/privacidad.html", "Aviso de privacidad"], ["/terminos.html", "Términos y condiciones"], ["/cookies.html", "Cookies y almacenamiento"], ["/reembolsos.html", "Pagos y reembolsos"]];
for (const [ruta, titulo] of paginas) {
  test(`${titulo}: título, versión y enlaces a los demás textos legales @movil`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page.locator("h1")).toHaveText(titulo);
    await expect(page.locator(".legal__version")).toContainText("2026");
    for (const [otra] of paginas) await expect(page.locator(`footer a[href="${otra.slice(1)}"]`)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("el pie de la portada enlaza a los cuatro textos legales", async ({ page }) => {
  await page.goto("/");
  for (const [ruta] of paginas) await expect(page.locator(`.foot a[href="${ruta.slice(1)}"]`)).toHaveCount(1);
});

test("el aviso de privacidad informa lo que exige la LOPDP (art. 12)", async ({ page }) => {
  await page.goto("/privacidad.html");
  const texto = await page.locator("main").innerText();
  for (const tema of ["Quién es responsable", "Para qué los usamos", "base legal", "fuera del Ecuador", "Cuánto tiempo", "Tus derechos", "15 días", "Superintendencia de Protección de Datos Personales", "automática"])
    expect(texto).toContain(tema);
});

test("el mapa de OpenStreetMap no se carga hasta que se pide", async ({ page }) => {
  const externos = [];
  page.on("request", (r) => { if (r.url().includes("openstreetmap")) externos.push(r.url()); });
  await page.goto("/#contacto");
  await expect(page.getByRole("button", { name: "Ver el mapa" })).toBeVisible();
  expect(externos).toEqual([]);
});
