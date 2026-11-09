import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { calcularTarifa, filasTabla, valorActo, desdeHoja } from "../js/nucleo.js";

const T = JSON.parse(readFileSync(new URL("../data/tarifas.json", import.meta.url), "utf8"));
const cuantia = (tabla, monto, tarifas = T) => calcularTarifa({ tarifa: { tipo: "cuantia", tabla } }, tarifas, { monto });
const acto = (nombre) => T.tarifario.listas.flatMap((l) => l.items).find((i) => i.nombre === nombre);

describe("tarifario con el SBU 2026 (482)", () => {
  it("reproduce los valores publicados por las notarías de Quito", () => {
    expect(filasTabla(T, "transferencia")[0]).toMatchObject({ desde: 0, hasta: 10000, base: 96.4, iva: 14.46, total: 110.86 });
    expect(filasTabla(T, "promesa")[1]).toMatchObject({ desde: 10000, base: 120.5, total: 138.58 });
    expect(filasTabla(T, "hipoteca")[0].base).toBe(62.66);
    expect(filasTabla(T, "sociedades")[0].base).toBe(337.4);
    expect(filasTabla(T, "bajaInventarios")[4].base).toBe(327.76);
    expect(filasTabla(T, "remates")[0].total).toBe(127.49);
    expect(valorActo(acto("Divorcio por mutuo consentimiento"), T)).toEqual({ base: 187.98, iva: 28.2, total: 216.18 });
    expect(valorActo(acto("Compulsas y copias certificadas"), T).total).toBe(2.06);
    expect(valorActo(acto("Razón marginal de revocatoria de poderes de la misma notaría"), T).base).toBe(0);
  });

  it("cada tabla del tarifario existe y sus rangos crecen", () => {
    for (const { tabla } of T.tarifario.cuantia) {
      const filas = T.tablas[tabla];
      expect(filas?.length, tabla).toBeGreaterThan(0);
      const limites = filas.map((f) => f[0]).filter((h) => h !== null);
      expect(limites, tabla).toEqual([...limites].sort((a, b) => a - b));
    }
    expect(T.tarifario.listas.flatMap((l) => l.items).every((i) => (i.sbu ?? i.usd) >= 0)).toBe(true);
  });

  it("cobra el excedente sobre lo que pasa del inicio del rango", () => {
    expect(cuantia("transferencia", 3500000).base).toBe(9640);
    expect(cuantia("transferencia", 5000000).base).toBe(9640 + 1000);
    expect(cuantia("arriendo", 300).base).toBe(30);
    expect(cuantia("arriendo", 2000).base).toBe(72.3);
    expect(cuantia("emisionObligaciones", 100000000).base).toBe(10000);
    expect(cuantia("cesionParticipaciones", 200000).base).toBe(964 + 200);
    expect(cuantia("sociedades", 2000000).base).toBe(2410 + 3000);
  });

  it("en enero basta con cambiar el SBU para recalcular todo", () => {
    const T2027 = { ...T, sbu: 500 };
    expect(filasTabla(T2027, "transferencia")[0].base).toBe(100);
    expect(valorActo(acto("Divorcio por mutuo consentimiento"), T2027).base).toBe(195);
    // Las tarifas fijas en dólares no dependen del SBU.
    expect(valorActo(acto("Certificación de planos"), T2027).base).toBe(3);
  });
});

describe("pestaña «tablas» de la hoja", () => {
  it("lee la columna Excedente y reconoce las tablas nuevas", () => {
    const base = { data: { categorias: [], tramites: [], faq: [], avisos: [] }, tarifas: T, notaria: { telefonos: [], redes: {}, horario: {}, mapa: {} } };
    const r = desdeHoja({
      categorias: "Código,Nombre,Resumen,Mostrar\npoderes,Poderes,Da poder,Sí\n",
      tramites: "Código,Categoría,Trámite,Descripción,Requisitos (uno por línea),Pasos (uno por línea),Tipo de tarifa,Valor,Unidad,Tabla de cuantía,Nota,Mostrar\npoder,poderes,Poder especial,Desc,Cédula,Firma,Porcentaje del SBU,12,,,,Sí\n",
      tablas: "Tabla,Hasta,Factor,Excedente\nTransferencia de dominio,10000,\"0,21\",\nTransferencia de dominio,,20,\"0,001\"\nCesión de participaciones,1000,0.5,\n" }, base);
    expect(r.tarifas.tablas.transferencia).toEqual([[10000, 0.21], [null, 20, 0.001]]);
    expect(r.tarifas.tablas.cesionParticipaciones).toEqual([[1000, 0.5]]);
    expect(r.tarifas.tablas.promesa).toEqual(T.tablas.promesa);
    expect(r.tarifas.tarifario).toEqual(T.tarifario);
  });
});
