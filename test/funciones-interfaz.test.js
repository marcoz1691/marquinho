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
  // Si falla la configuración, las funciones de siempre siguen encendidas; portal y pagos en línea quedan apagados.
  const { portal, pagosEnLinea, ...deSiempre } = await cargarFunciones(fetch);
  expect(Object.values(deSiempre).every(Boolean)).toBe(true);
  expect([portal, pagosEnLinea]).toEqual([false, false]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await cargarFunciones(async () => Response.json({ funciones: { agenda: "0" } }))).agenda).toBe(true);
});

it("en la web, portal y pagos en línea quedan apagados si el servidor no los enciende", async () => {
  const { cargarFunciones } = await import("../js/precios.js");
  expect(await cargarFunciones(async () => Response.json({ funciones: {} }))).toMatchObject({ portal: false, pagosEnLinea: false, agenda: true });
  expect(await cargarFunciones(async () => Response.json({ funciones: { portal: true } }))).toMatchObject({ portal: true });
});
