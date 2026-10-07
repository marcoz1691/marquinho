import { describe, it, expect } from "vitest";
import { construirResumen, textoResumen } from "../api/_lib/resumen.js";
import { AVISO_HABILITANTES } from "../js/nucleo.js";

const cita = { codigo: "4821", estado: "confirmada", fecha: "2026-10-08", hora: "10:00", nombre: "Ana Pérez", tramiteId: "poder" };
const C = { data: { tramites: [{ id: "poder", nombre: "Poder general", req: ["Cédula"], tarifa: { tipo: "pct", valor: 0.12 } }] }, tarifas: { sbu: 482, iva: 0.15 }, notaria: { direccion: "Quito" } };
describe("resumen de cita", () => {
  it("construye la forma del contrato sin mutar requisitos", () => {
    const r = construirResumen(cita, C, { subirDocumentos: true });
    expect(r).toEqual({ tipo: "cita", codigo: "4821", estado: "confirmada", fecha: "2026-10-08", fechaTexto: "jueves 8 de octubre", hora: "10:00", nombre: "Ana Pérez", tramite: { id: "poder", nombre: "Poder general" }, direccion: "Quito", requisitos: ["Cédula"], costo: { total: "$66,52", detalle: "Tarifa $57,84 + IVA $8,68" }, aviso: AVISO_HABILITANTES, subirDocumentos: true });
    r.requisitos.push("Otro");
    expect(C.data.tramites[0].req).toEqual(["Cédula"]);
  });
  it.each(["cuantia", "consultar", "desconocido"])("omite costos sin tarifa calculable (%s)", (tipo) => {
    const contenido = structuredClone(C);
    contenido.data.tramites[0].tarifa = { tipo };
    const r = construirResumen(cita, contenido);
    expect(r.costo).toBeNull(); expect(r.aviso).toBeNull(); expect(r.subirDocumentos).toBe(false);
  });
  it("sin trámite deja requisitos vacíos", () => {
    expect(construirResumen({ ...cita, tramiteId: null }, C)).toMatchObject({ tramite: null, requisitos: [], costo: null, aviso: null });
  });
  it("formatea el texto confirmado en líneas cortas", () => {
    expect(textoResumen(construirResumen(cita, C))).toBe(`Tu cita quedó confirmada. Ticket 4821\nJueves 8 de octubre, 10:00\nTrámite: Poder general\nLugar: Quito\nLleva: • Cédula\nCosto referencial: $66,52 con IVA. ${AVISO_HABILITANTES}\nCon tu ticket 4821 te atienden más rápido.`);
  });
  it("explica la confirmación pendiente sin mostrar null ni campos vacíos", () => {
    const texto = textoResumen(construirResumen({ ...cita, estado: "pendiente", tramiteId: null }, C));
    expect(texto).toContain("Recibimos tu solicitud. El personal la confirmará por WhatsApp. Ticket 4821");
    expect(texto).not.toMatch(/null|Lleva:|Costo referencial:|Trámite:/);
  });
});
