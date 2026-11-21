// Web de la Notaría 42: sitio estático en notaria42/, servido aparte en el puerto 4174.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { calcularConHabilitantes } from "../notaria42/js/nucleo.js";

const URL_N42 = "http://localhost:4174";
const D = JSON.parse(readFileSync(new URL("../notaria42/data/tramites.json", import.meta.url)));
const T = JSON.parse(readFileSync(new URL("../notaria42/data/tarifas.json", import.meta.url)));
const dinero = (n) => "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function abrir(page) {
  const errores = [], externos = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith(URL_N42) && !r.url().startsWith("data:")) externos.push(r.url()); });
  await page.goto(URL_N42 + "/");
  await expect(page.locator("#lista .lista__item").first()).toBeVisible();
  return { errores, externos };
}

for (const movil of [false, true]) {
  test(`portada, catálogo y calculadora de la Notaría 42${movil ? " @movil" : ""}`, async ({ page }) => {
    const { errores, externos } = await abrir(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("María Lorena Bermúdez Pozo");

    // Buscar un trámite muestra sus requisitos.
    await page.locator("#buscar").fill("salida del pais");
    const item = page.locator("#lista .lista__item").first();
    await expect(item).toContainText("salida");
    if (movil) await item.click();
    const det = page.locator("#detalle");
    await expect(det).toBeVisible();
    const id = await det.getAttribute("data-id");
    const t = D.tramites.find((x) => x.id === id);
    await expect(det.locator(".check li")).toHaveCount(t.req.length);

    // «Calcular costo» lleva a la calculadora con ese trámite y el total coincide con el núcleo.
    await det.locator("[data-calc]").click();
    await expect(page.locator("#calcTramite")).toHaveValue(t.id);
    const c = calcularConHabilitantes(t, T, { cantidad: 1, monto: 0 }, {}, D.tramites);
    await expect(page.locator("#rTotal")).toHaveText(dinero(c.total));

    // Calculadora básica: solo los más solicitados, sin habilitantes; la cantidad multiplica cuando se cobra «por menor».
    await expect(page.locator("#calcTramite option")).toHaveCount(9);
    await expect(page.locator("#calc fieldset, #calcMonto")).toHaveCount(0);
    await page.locator("#calcQty").fill("2");
    const dos = calcularConHabilitantes(t, T, { cantidad: 2, monto: 0 }, {}, D.tramites);
    await expect(page.locator("#rTotal")).toHaveText(dinero(dos.total));

    // Contacto.
    await expect(page.locator('#contacto a[href="tel:+59326019691"]')).toBeVisible();
    await expect(page.locator('#contacto a[href="mailto:contacto@notaria42quito.com"]')).toBeVisible();
    await expect(page.locator("#comoLlegar")).toHaveAttribute("href", /google\.com\/maps/);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(errores).toEqual([]);
    expect(externos).toEqual([]);
  });
}

test("menú del celular y modo oscuro @movil", async ({ page }) => {
  await abrir(page);
  const burger = page.locator("#burger");
  await burger.click();
  await expect(burger).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Contacto", exact: true }).click();
  await expect(burger).toHaveAttribute("aria-expanded", "false");
  await page.locator("#tema").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".hero__sello .tema-oscuro")).toBeVisible();
});

test("enlace directo a un trámite y privacidad", async ({ page }) => {
  await page.goto(URL_N42 + "/#t-poder-natural");
  await expect(page.locator("#detalle")).toHaveAttribute("data-id", "poder-natural");
  const r = await page.request.get(URL_N42 + "/privacidad.html");
  expect(r.ok()).toBe(true);
  expect(r.headers()["content-security-policy"]).toMatch(/^default-src 'none'/);
});
