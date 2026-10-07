import { describe, it, expect } from "vitest";
import { parseCSV, num, fecha, desdeHoja, calcularTarifa, precioTexto, montoEscrito, estaAbierto } from "../js/nucleo.js";

const TARIFAS = {
  sbu: 482, iva: 0.15, anio: 2026,
  tablas: { transferencia: [[10000, 0.2], [30000, 0.35], [60000, 0.5], [90000, 0.8], [null, 20]] }
};
const base = {
  data: { categorias: [], tramites: [], faq: [{ q: "local", a: "local" }], avisos: [] },
  tarifas: TARIFAS,
  notaria: { nombre: "Notaría 41", telefonos: [], horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "" }, mapa: { lat: 0, lng: 0 }, redes: {} }
};

describe("parseCSV", () => {
  it("respeta comas y saltos de línea dentro de comillas", () => {
    expect(parseCSV('a,b\n"uno, dos","línea 1\nlínea 2"\n')).toEqual([["a", "b"], ["uno, dos", "línea 1\nlínea 2"]]);
  });
});

describe("num", () => {
  it("entiende los formatos que publica Sheets en español", () => {
    expect([num("0,35"), num("1.79"), num("10.000"), num("1.000.000,50"), num("abc")]).toEqual([0.35, 1.79, 10000, 1000000.5, null]);
  });
});

describe("fecha", () => {
  it("convierte día/mes/año a AAAA-MM-DD", () => {
    expect([fecha("2/11/2026"), fecha("2026-11-02"), fecha("")]).toEqual(["2026-11-02", "2026-11-02", ""]);
  });
});

describe("desdeHoja", () => {
  const tabs = {
    categorias: "Código,Nombre,Resumen,Mostrar\npoderes,Poderes,Da poder,Sí\n",
    tramites: "Código,Categoría,Trámite,Descripción,Requisitos (uno por línea),Pasos (uno por línea),Tipo de tarifa,Valor,Unidad,Tabla de cuantía,Nota,Mostrar\n" +
      'poder,poderes,Poder especial,Desc,"Cédula\nMinuta",Firma,Porcentaje del SBU,12,,,,Sí\n' +
      "oculto,poderes,Oculto,D,R,P,Consultar,,,,,No\n",
    configuracion: "Dato,Valor\nSBU,500\nWhatsApp,593999999999\n"
  };

  it("arma trámites visibles con requisitos por línea y tarifa en fracción", () => {
    const r = desdeHoja(tabs, base);
    expect(r.data.tramites).toHaveLength(1);
    expect(r.data.tramites[0]).toMatchObject({ id: "poder", req: ["Cédula", "Minuta"], tarifa: { tipo: "pct", valor: 0.12 } });
  });

  it("aplica la configuración sobre los datos locales", () => {
    const r = desdeHoja(tabs, base);
    expect(r.tarifas.sbu).toBe(500);
    expect(r.notaria.whatsapp).toBe("593999999999");
  });

  it("conserva las preguntas locales si la hoja no trae la pestaña", () => {
    expect(desdeHoja(tabs, base).data.faq).toEqual([{ q: "local", a: "local" }]);
  });

  it("marca los trámites que el personal revisa antes de confirmar la cita", () => {
    const hoja = { ...tabs, tramites: "Código,Categoría,Trámite,Descripción,Requisitos,Pasos,Tipo de tarifa,Valor,Unidad,Tabla de cuantía,Nota,Revisión antes de la cita,Mostrar\n" +
      "poder,poderes,Poder especial,D,R,P,Consultar,,,,,No,Sí\ncompraventa,poderes,Compraventa,D,R,P,Consultar,,,,,Sí,Sí\n" };
    const [poder, compraventa] = desdeHoja(hoja, base).data.tramites;
    expect(poder.revision).toBeUndefined();
    expect(compraventa.revision).toBe(true);
  });

  it("si la hoja no tiene la columna de revisión, conserva la marca de los datos locales", () => {
    const local = { ...base, data: { ...base.data, tramites: [{ id: "poder", revision: true }] } };
    expect(desdeHoja(tabs, local).data.tramites[0].revision).toBe(true);
  });

  it("lee el cupo de citas por hora y los feriados de la configuración", () => {
    const r = desdeHoja({ ...tabs, configuracion: "Dato,Valor\nCitas por hora,3\nFeriados,\"2/11/2026, 3/11/2026\"\n" }, base);
    expect(r.notaria.citas).toEqual({ porHora: 3, feriados: ["2026-11-02", "2026-11-03"] });
  });

  it("lee el cargo del notario de la configuración", () => {
    const r = desdeHoja({ ...tabs, configuracion: "Dato,Valor\nCargo del notario,Notario Cuadragésimo Primero del Cantón Quito\n" }, base);
    expect(r.notaria.cargo).toBe("Notario Cuadragésimo Primero del Cantón Quito");
  });

  it("rechaza una hoja sin trámites", () => {
    expect(() => desdeHoja({ ...tabs, tramites: "Código\n" }, base)).toThrow();
  });
});

describe("calcularTarifa", () => {
  it("porcentaje del SBU por unidad", () => {
    const t = { tarifa: { tipo: "pct", valor: 0.03, unidad: "por firma" } };
    expect(calcularTarifa(t, TARIFAS, { cantidad: 3 })).toMatchObject({ base: 43.38, iva: 6.51, total: 49.89 });
  });

  it("cuantía usa el rango de la tabla", () => {
    const t = { tarifa: { tipo: "cuantia", tabla: "transferencia" } };
    const r = calcularTarifa(t, TARIFAS, { monto: 85000 });
    expect(r).toMatchObject({ base: 385.6, total: 443.44, factor: 0.8, desde: 60000, hasta: 90000 });
  });

  it("cuantía sin monto no calcula", () => {
    const t = { tarifa: { tipo: "cuantia", tabla: "transferencia" } };
    expect(calcularTarifa(t, TARIFAS, {}).total).toBeNull();
  });

  it("consultar no tiene valor", () => {
    expect(calcularTarifa({ tarifa: { tipo: "consultar" } }, TARIFAS, {}).total).toBeNull();
  });

  it("redondea medio centavo hacia arriba", () => {
    // 0,35 SBU = 168,70; IVA exacto 25,305
    const t = { tarifa: { tipo: "cuantia", tabla: "transferencia" } };
    expect(calcularTarifa(t, TARIFAS, { monto: 20000 })).toMatchObject({ base: 168.7, iva: 25.31, total: 194.01 });
  });
});

describe("montoEscrito", () => {
  it("entiende puntos o comas de miles", () => {
    expect(["85000", "85.000", "85,000", "$ 85.000", "1.250.000", "1,250,000"].map(montoEscrito)).toEqual([85000, 85000, 85000, 85000, 1250000, 1250000]);
  });

  it("entiende decimales con punto o coma", () => {
    expect(["10000.01", "10000,01", "1.250.000,50", "1,250,000.50", "85000,5"].map(montoEscrito)).toEqual([10000.01, 10000.01, 1250000.5, 1250000.5, 85000.5]);
  });

  it("sin dígitos no hay monto", () => {
    expect(["", "abc", "."].map(montoEscrito)).toEqual([null, null, null]);
  });
});

describe("estaAbierto", () => {
  const horario = { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00" };
  const quito = (s) => new Date(s + "-05:00");

  it("usa la hora de Quito sin importar la zona del equipo", () => {
    expect(estaAbierto(horario, quito("2026-10-05T10:00:00"))).toBe(true);
    expect(estaAbierto(horario, quito("2026-10-05T20:00:00"))).toBe(false);
  });

  it("abre a la hora de apertura y cierra a la de cierre", () => {
    expect(estaAbierto(horario, quito("2026-10-05T07:59:00"))).toBe(false);
    expect(estaAbierto(horario, quito("2026-10-05T08:00:00"))).toBe(true);
    expect(estaAbierto(horario, quito("2026-10-09T17:00:00"))).toBe(false);
  });

  it("no abre en días no laborables", () => {
    expect(estaAbierto(horario, quito("2026-10-10T10:00:00"))).toBe(false);
  });
});

describe("precioTexto", () => {
  it("muestra valor más IVA y unidad", () => {
    expect(precioTexto({ tarifa: { tipo: "pct", valor: 0.03, unidad: "por firma" } }, TARIFAS)).toBe("$14,46 + IVA por firma");
  });
});
