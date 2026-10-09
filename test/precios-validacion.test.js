// Reglas de seguridad de los precios editables: lo que un administrador puede y no puede dejar guardado.
import { describe, it, expect, beforeEach } from "vitest";
import { crearPanel } from "../api/_lib/panel.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { aplicarPrecios } from "../js/precios.js";
import { Aviso } from "../api/_lib/errores.js";
import { calcularTarifa } from "../js/nucleo.js";

const base = () => ({
  data: { categorias: [], faq: [], avisos: [], tramites: [
    { id: "poder", nombre: "Poder", tarifa: { tipo: "pct", valor: 0.12 } },
    { id: "copias-certificadas", nombre: "Copias certificadas", tarifa: { tipo: "fija", valor: 1.79, unidad: "por hoja" } },
    { id: "certificacion-electronica", nombre: "Materialización", tarifa: { tipo: "fija", valor: 1.34, unidad: "por hoja" } },
    { id: "compraventa", nombre: "Compraventa", tarifa: { tipo: "cuantia", tabla: "transferencia" } }] },
  tarifas: { sbu: 482, iva: 0.15, anio: "2026", tablas: { transferencia: [[60000, 0.5], [null, 20]] } },
  notaria: {}
});
let panel, almacen;
beforeEach(() => {
  almacen = crearAlmacenMemoria();
  panel = crearPanel({ almacen, whatsapp: {}, contenido: async () => structuredClone(base()) });
});
const guardar = (p) => panel.guardarPrecio({ tramiteId: "copias-certificadas", tipo: "fija", valor: 2, unidad: "por hoja", ...p }, "admin@x.ec");

describe("guardarPrecio: no deja romper el cobro por unidad", () => {
  it("rechaza quitar el «por» a un trámite que se cobra por unidad (200 copias pasarían a costar 1)", async () => {
    for (const unidad of ["", "  ", "hoja", "c/u"]) await expect(guardar({ unidad })).rejects.toThrow(/por/);
    await expect(guardar({ unidad: "por página" })).resolves.toBeUndefined();
    expect((await almacen.precios())[0]).toMatchObject({ unidad: "por página" });
  });
  it("un precio guardado con unidad por sigue multiplicando por la cantidad", async () => {
    await guardar({ valor: 2 });
    const C = base(); aplicarPrecios(C, { precios: Object.fromEntries((await almacen.precios()).map((p) => [p.tramiteId, p])) });
    expect(calcularTarifa(C.data.tramites[1], C.tarifas, { cantidad: 200 }).base).toBe(400);
  });
});

describe("guardarPrecio: los documentos habilitantes siempre tienen precio por hoja", () => {
  it.each(["consultar", "cuantia"])("rechaza dejar las copias o la materialización en «%s» (su costo desaparecería del total)", async (tipo) => {
    for (const tramiteId of ["copias-certificadas", "certificacion-electronica"])
      await expect(panel.guardarPrecio({ tramiteId, tipo, valor: null, tabla: "transferencia", unidad: "por hoja" }, "a")).rejects.toThrow(/habilitante|por hoja/i);
  });
  it("un trámite que no es habilitante sí puede pasar a «consultar»", async () => {
    await expect(panel.guardarPrecio({ tramiteId: "poder", tipo: "consultar" }, "a")).resolves.toBeUndefined();
  });
});

describe("guardarPrecio: topes que atrapan un dedazo", () => {
  it.each([
    [{ tipo: "pct", tramiteId: "poder", unidad: "", valor: 6 }, "5"],
    [{ tipo: "pct", tramiteId: "poder", unidad: "", valor: 0.0001 }, "0"],
    [{ tipo: "fija", valor: 1001 }, "1000"],
    [{ tipo: "fija", valor: 0.001 }, "0,01|0.01"]
  ])("rechaza %j", async (p, texto) => { await expect(guardar(p)).rejects.toThrow(new RegExp(texto)); });
  it("acepta los valores reales (12 % del SBU y $1,79)", async () => {
    await expect(guardar({ tipo: "pct", tramiteId: "poder", unidad: "", valor: 0.12 })).resolves.toBeUndefined();
    await expect(guardar({ valor: 1.79 })).resolves.toBeUndefined();
  });
  it.each(["<b>hoja</b>", "por\nhoja", "por hoja\u0000", "x".repeat(31)])("rechaza una unidad con caracteres raros o muy larga: %j", async (unidad) => {
    await expect(guardar({ unidad })).rejects.toBeInstanceOf(Aviso);
  });
});

describe("aplicarPrecios: un dato corrupto no puede dejar precios absurdos", () => {
  const aplicar = (cambios) => aplicarPrecios(base(), cambios);
  it("descarta entradas inválidas y conserva el valor oficial", () => {
    const c = aplicar({ precios: {
      poder: { tipo: "pct", valor: null }, "copias-certificadas": { tipo: "inventado", valor: 5 },
      "certificacion-electronica": { tipo: "fija", valor: NaN }, compraventa: { tipo: "cuantia", tabla: "no-existe" } } });
    expect(c.data.tramites.map((t) => t.tarifa)).toEqual(base().data.tramites.map((t) => t.tarifa));
  });
  it("no toma datos del prototipo si un trámite se llama «constructor»", () => {
    const c = base(); c.data.tramites.push({ id: "constructor", tarifa: { tipo: "consultar" } });
    aplicarPrecios(c, { precios: {} });
    expect(c.data.tramites.at(-1).tarifa).toEqual({ tipo: "consultar" });
  });
  it.each([null, 0, -5, "abc", NaN, Infinity])("ignora un SBU inválido (%s) y conserva el oficial", (sbu) => {
    expect(aplicar({ precios: {}, sbu }).tarifas.sbu).toBe(482);
  });
  it("ignora un año que no sea de cuatro dígitos", () => {
    expect(aplicar({ precios: {}, anio: "dos mil" }).tarifas.anio).toBe("2026");
    expect(aplicar({ precios: {}, anio: "2027" }).tarifas.anio).toBe("2027");
  });
  it("aplica una entrada válida", () => {
    expect(aplicar({ precios: { poder: { tipo: "pct", valor: 0.2 } }, sbu: 500 }).data.tramites[0].tarifa).toMatchObject({ tipo: "pct", valor: 0.2 });
  });
});

describe("SBU editado: se puede volver al valor oficial de la hoja", () => {
  it("restaurarSBU borra el SBU y el año guardados", async () => {
    await panel.guardarSBU({ sbu: 500, anio: "2027" }, "admin");
    expect((await panel.precios()).sbuEditado).toBe(true);
    await panel.restaurarSBU();
    expect(await almacen.ajustes()).toEqual({});
    expect((await panel.precios()).sbuEditado).toBe(false);
  });
});
