import { leerFunciones } from "../api/_lib/funciones.js";
import { it, expect } from "vitest";
import { crearManejadorPrecios } from "../api/precios.js";
import { cargarPrecios } from "../js/precios.js";

it("publica solo tarifas y ajustes guardados, sin datos de auditoría", async () => {
  const r = await crearManejadorPrecios({ almacen: { precios: async () => [{ tramiteId: "t", tipo: "fija", valor: 10, unidad: "", tabla: "", actualizadoPor: "privado" }], ajustes: async () => ({ sbu: 500 }) } })();
  expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  expect(await r.json()).toEqual({ precios: { t: { tipo: "fija", valor: 10, unidad: "", tabla: "" } }, sbu: 500, funciones: leerFunciones() });
});
it("si falla la API pública, la web conserva el contenido de la hoja", async () => {
  const c = { data: { tramites: [{ id: "t", tarifa: { tipo: "consultar" } }] }, tarifas: { sbu: 482 } };
  for (const fetch of [async () => { throw Error("sin red"); }, async () => new Response("", { status: 503 }), async () => new Response("no JSON")]) {
    expect(await cargarPrecios(c, fetch)).toBe(c);
  }
});
it("la web aplica precios sobre una copia antes de pintar", async () => {
  const c = { data: { tramites: [{ id: "t", tarifa: { tipo: "consultar" } }] }, tarifas: { sbu: 482 } };
  const r = await cargarPrecios(c, async () => Response.json({ precios: { t: { tipo: "fija", valor: 20 } }, sbu: 500 }));
  expect(r.data.tramites[0].tarifa.valor).toBe(20);
  expect(c.data.tramites[0].tarifa.tipo).toBe("consultar");
});

it("una caída del almacén devuelve 503 sin publicar ni cachear datos incompletos", async () => {
  const r = await crearManejadorPrecios({ almacen: { precios: async () => { throw Error("dato privado"); }, ajustes: async () => ({}) } })();
  expect(r.status).toBe(503);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(await r.json())).not.toContain("dato privado");
});

it("no publica los cupos ni los bloqueos de la agenda (sus motivos son internos)", async () => {
  const ajustes = async () => ({ sbu: 500, anio: "2027", "citas.porHora": "3", "citas.bloqueos": '[{"fecha":"2026-10-20","hora":null,"motivo":"Viaje del notario"}]' });
  const r = await crearManejadorPrecios({ almacen: { precios: async () => [], ajustes } })();
  expect(await r.json()).toEqual({ precios: {}, sbu: 500, anio: "2027", funciones: leerFunciones() });
});
it("publica los booleanos de funciones y mantiene privados los ajustes del piloto", async () => {
 const ajustes = { "funcion.sitio": "0", "funcion.chatWeb": "0", "metricas.precio.entrada": "7", "piloto.inicio": "2026-10-11" };
 const r = await crearManejadorPrecios({ almacen: { precios: async () => [], ajustes: async () => ajustes } })();
 expect(await r.json()).toEqual({ precios: {}, funciones: leerFunciones(ajustes) });
});

it("si no se pueden leer los ajustes, responde 503 en vez de publicar precios con el SBU por defecto", async () => {
  const r = await crearManejadorPrecios({ almacen: { precios: async () => [], ajustes: async () => { throw Error("sin base"); } } })();
  expect(r.status).toBe(503);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
});
