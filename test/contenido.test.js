import { describe, it, expect, vi } from "vitest";
import { crearContenido } from "../api/_lib/contenido.js";

const local = {
  tramites: { categorias: [{ id: "c", nombre: "Local", resumen: "" }], tramites: [{ id: "t", cat: "c", nombre: "Trámite local", desc: "", req: [], pasos: [], tarifa: { tipo: "consultar" } }], faq: [], avisos: [] },
  tarifas: { sbu: 482, iva: 0.15, anio: 2026, tablas: {} },
  notaria: { nombre: "Notaría 41", telefonos: [], horario: { dias: [1], abre: "08:00", cierra: "17:00", texto: "" }, mapa: { lat: 0, lng: 0 }, redes: {} }
};
const hoja = {
  "1": "Código,Categoría,Trámite,Descripción,Requisitos (uno por línea),Pasos (uno por línea),Tipo de tarifa,Valor,Unidad,Tabla de cuantía,Nota,Mostrar\nh,c,Trámite de la hoja,,,,Consultar,,,,,Sí\n",
  "2": "Código,Nombre,Resumen,Mostrar\nc,Hoja,,Sí\n"
};
const config = (conHoja) => ({ googleSheet: conHoja ? { documento: "DOC", pestanas: { tramites: "1", categorias: "2" } } : {} });
const fetchHoja = (fallar = false) => vi.fn(async (url) => {
  if (fallar) throw new Error("sin red");
  return new Response(hoja[new URL(url).searchParams.get("gid")], { status: 200 });
});

describe("crearContenido", () => {
  it("sin hoja configurada usa los JSON locales", async () => {
    const c = crearContenido({ leerLocal: async () => ({ ...local, config: config(false) }), fetch: fetchHoja() });
    expect((await c()).data.tramites[0].nombre).toBe("Trámite local");
  });

  it("con hoja configurada usa la hoja", async () => {
    const fetch = fetchHoja();
    const c = crearContenido({ leerLocal: async () => ({ ...local, config: config(true) }), fetch });
    expect((await c()).data.tramites[0].nombre).toBe("Trámite de la hoja");
    expect(fetch.mock.calls[0][0]).toContain("/spreadsheets/d/DOC/export?format=csv&gid=");
  });

  it("guarda en caché por 5 minutos", async () => {
    let t = 0;
    const fetch = fetchHoja();
    const c = crearContenido({ leerLocal: async () => ({ ...local, config: config(true) }), fetch, ahora: () => t });
    await c(); t = 4 * 60 * 1000; await c();
    expect(fetch).toHaveBeenCalledTimes(2); // una vez por pestaña
    t = 6 * 60 * 1000; await c();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("si la hoja falla después de haber cargado, conserva la última copia válida", async () => {
    let t = 0, fallar = false;
    const fetch = vi.fn(async (url) => { if (fallar) throw new Error("caída"); return new Response(hoja[new URL(url).searchParams.get("gid")]); });
    const c = crearContenido({ leerLocal: async () => ({ ...local, config: config(true) }), fetch, ahora: () => t });
    await c(); fallar = true; t = 10 * 60 * 1000;
    expect((await c()).data.tramites[0].nombre).toBe("Trámite de la hoja");
  });

  it("si la hoja falla desde el inicio, usa los JSON locales", async () => {
    const c = crearContenido({ leerLocal: async () => ({ ...local, config: config(true) }), fetch: fetchHoja(true) });
    expect((await c()).data.tramites[0].nombre).toBe("Trámite local");
  });
});

describe("crearContenido con los archivos reales de data/", () => {
  it("lee los 48 trámites locales cuando la hoja no responde", async () => {
    const c = crearContenido({ fetch: async () => { throw new Error("sin red"); } });
    const r = await c();
    expect(r.data.tramites.length).toBe(48);
    expect(r.tarifas.sbu).toBe(482);
  });
});

it("aplica precios y ajustes sin mutar la fuente y renueva al vencer", async () => {
  let tiempo = 0, valor = 10;
  const almacen = { precios: async () => [{ tramiteId: "t", tipo: "fija", valor }], ajustes: async () => ({ sbu: 500, anio: "2027" }) };
  const c = crearContenido({ almacen, leerLocal: async () => local, ahora: () => tiempo });
  expect((await c()).data.tramites[0].tarifa.valor).toBe(10);
  expect(local.tramites.tramites[0].tarifa.tipo).toBe("consultar");
  valor = 20; tiempo = 300001;
  expect((await c()).data.tramites[0].tarifa.valor).toBe(20);
  expect((await c()).tarifas.sbu).toBe(500);
});

it("conserva las ediciones previas si el almacén falla sin registrar datos personales", async () => {
  let tiempo = 0, falla = false;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const c = crearContenido({ leerLocal: async () => local, ahora: () => tiempo, almacen: {
    precios: async () => { if (falla) throw Error("correo privado"); return [{ tramiteId: "t", tipo: "fija", valor: 50 }]; }, ajustes: async () => ({})
  } });
  await c(); tiempo = 300001; falla = true;
  expect((await c()).data.tramites[0].tarifa.valor).toBe(50);
  expect(warn.mock.calls.flat().join(" ")).not.toContain("correo privado");
  warn.mockRestore();
});

it("restaurar en el panel muestra el valor oficial incluso con el caché efectivo vigente", async () => {
  const { crearPanel } = await import("../api/_lib/panel.js");
  const { crearAlmacenMemoria } = await import("../api/_lib/almacen-memoria.js");
  const almacen = crearAlmacenMemoria();
  await almacen.guardarPrecio({ tramiteId: "t", tipo: "fija", valor: 30 });
  const contenido = crearContenido({ almacen, leerLocal: async () => local });
  await contenido();
  const panel = crearPanel({ almacen, contenido });
  await panel.restaurarPrecio("t");
  expect((await panel.precios()).tramites[0]).toMatchObject({ editada: false, tarifa: { tipo: "consultar" } });
});
