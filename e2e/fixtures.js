import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

export const datos = JSON.parse(readFileSync(new URL("../data/tramites.json", import.meta.url)));
export const notaria = JSON.parse(readFileSync(new URL("../data/notaria.json", import.meta.url)));
export const tramite = (id) => datos.tramites.find((t) => t.id === id);

export const test = base.extend({
  // Fuentes, íconos y mapa vienen de internet; se bloquean para que las pruebas no dependan de la red.
  context: async ({ context, baseURL }, use) => {
    const local = new URL(baseURL).host;
    await context.route(/^https?:\/\//, (route) =>
      new URL(route.request().url()).host === local ? route.fallback() : route.abort()
    );
    await use(context);
  }
});

// Abre la portada y espera a que los trámites se hayan pintado.
export async function abrirPortada(page, ruta = "/") {
  await page.goto(ruta);
  await expect(page.locator("#lista .tl__item").first()).toBeVisible();
}

// Simula /api/chat; `responder` recibe el cuerpo enviado y devuelve { status, json }, o "sin-red" para cortar la conexión.
export async function simularApi(page, responder) {
  const pedidos = [];
  await page.route("**/api/chat", async (route) => {
    const cuerpo = route.request().postDataJSON();
    pedidos.push(cuerpo);
    const r = await responder(cuerpo);
    if (r === "sin-red") return route.abort("internetdisconnected");
    await route.fulfill({ status: r.status || 200, json: r.json });
  });
  return pedidos;
}

// Respuesta que queda pendiente hasta llamar a soltar().
export function respuestaRetenida(json) {
  let soltar;
  const espera = new Promise((r) => { soltar = r; });
  return { soltar: () => soltar(), responder: async () => { await espera; return { json }; } };
}

export { expect };
