import { it, expect, vi } from "vitest";
import { cargarFunciones, configPublica } from "../js/precios.js";
import { aplicarFunciones } from "../js/funciones.js";
it("comparte una petición entre lectores y falla abierto", async () => {
  const fetch = vi.fn(async () => Response.json({ funciones: { agenda: false } }));
  await configPublica(fetch);
  expect((await cargarFunciones(fetch)).agenda).toBe(false);
  expect((await cargarFunciones(fetch)).chatWeb).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await cargarFunciones(async () => { throw Error(); })).agenda).toBe(true);
});
it("oculta solo funciones apagadas y permite volver a encender", () => {
  const el = { dataset: { funcion: "agenda" }, hidden: false };
  const raiz = { querySelectorAll: () => [el] };
  aplicarFunciones({ agenda: false }, raiz); expect(el.hidden).toBe(true);
  aplicarFunciones({}, raiz); expect(el.hidden).toBe(false);
});
it("conserva el fallo de configuración por página y no confunde valores inválidos con apagado", async () => {
  const fetch = vi.fn(async () => new Response("no JSON"));
  expect(await configPublica(fetch)).toBe(null);
  expect(Object.values(await cargarFunciones(fetch)).every(Boolean)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await cargarFunciones(async () => Response.json({ funciones: { agenda: "0" } }))).agenda).toBe(true);
});
