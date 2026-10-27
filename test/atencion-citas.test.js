import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearPanel } from "../api/_lib/panel.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const contenido = async () => ({
  data: { categorias: [], tramites: [{ id: "compraventa", cat: "x", nombre: "Compraventa de inmuebles", desc: "", req: [], pasos: [], tarifa: { tipo: "consultar" } }], faq: [], avisos: [] },
  tarifas: { sbu: 482, iva: 0.15, tablas: {} },
  notaria: { nombre: "Notaría 41 de Quito", direccion: "Tumbaco", horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "" } }
});
const ANA = "ana@test.ec", LUIS = "luis@test.ec", NOTARIO = "notario@test.ec";
let almacen, panel, cita, doc;
beforeEach(async () => {
  almacen = crearAlmacenMemoria({ personal: [
    { email: ANA, nombre: "Ana", rol: "matricero" }, { email: LUIS, nombre: "Luis", rol: "matricero" }, { email: NOTARIO, nombre: "Notario", rol: "notario" }] });
  panel = crearPanel({ almacen, whatsapp: { enviarTexto: vi.fn(async () => ({})), enviarPlantilla: vi.fn(async () => ({})) }, contenido, ahora: () => new Date("2026-10-27T15:00:00Z") });
  const conv = await almacen.conversacion("form:593990000101", "Cliente");
  const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-27", hora: "10:00", nombre: "Cliente", contacto: "593990000101", estado: "confirmada" });
  cita = id;
  doc = (await almacen.guardarDocumento({ conversacionId: conv.id, solicitudId: id, descripcion: "Cédula" })).id;
});

describe("atención de citas por matriceros", () => {
  it("solo una persona consigue la cita cuando dos la piden a la vez", async () => {
    const r = await Promise.allSettled([panel.atenderCita(cita, ANA), panel.atenderCita(cita, LUIS)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const perdio = r.find((x) => x.status === "rejected").reason;
    expect(perdio.message).toMatch(/Ya la atiende (Ana|Luis)/);
    expect(perdio.status).toBe(409);
  });

  it("atender de nuevo la propia cita no falla y devolverla la libera", async () => {
    await panel.atenderCita(cita, ANA);
    expect(await panel.atenderCita(cita, ANA)).toEqual({ ya: true });
    await expect(panel.devolverCita(cita, LUIS)).rejects.toThrow(/la atiende Ana/);
    await panel.devolverCita(cita, ANA);
    expect((await almacen.cita(cita)).atiendeEmail).toBe("");
    await panel.atenderCita(cita, LUIS);
    expect((await almacen.cita(cita)).atiendeNombre).toBe("Luis");
  });

  it("los documentos los revisa solo quien atiende; el notario siempre puede", async () => {
    await expect(panel.revisarDocumento(doc, "aprobado", "", undefined, ANA)).rejects.toThrow(/pulsa Atender/);
    await panel.atenderCita(cita, ANA);
    await expect(panel.revisarDocumento(doc, "aprobado", "", undefined, LUIS)).rejects.toThrow(/la atiende Ana/);
    await expect(panel.urlDocumento(doc, LUIS)).rejects.toThrow(/la atiende Ana/);
    await panel.revisarDocumento(doc, "aprobado", "", undefined, ANA);
    expect((await almacen.documento(doc)).estado).toBe("aprobado");
    await panel.revisarDocumento(doc, "observado", "borrosa", undefined, NOTARIO);
    expect((await almacen.documento(doc)).estado).toBe("observado");
  });

  it("terminar exige ser quien atiende y deja la cita atendida", async () => {
    await expect(panel.terminarCita(cita, ANA)).rejects.toThrow(/pulsa Atender/);
    await panel.atenderCita(cita, ANA);
    await expect(panel.terminarCita(cita, LUIS)).rejects.toThrow(/la atiende Ana/);
    await panel.terminarCita(cita, ANA);
    expect((await almacen.cita(cita)).estado).toBe("atendida");
    await expect(panel.devolverCita(cita, ANA)).rejects.toThrow(/ya se atendió/);
  });

  it("el notario reasigna a un matricero y no a cualquiera", async () => {
    await panel.atenderCita(cita, ANA);
    await panel.reasignarCita(cita, LUIS);
    expect((await almacen.cita(cita)).atiendeEmail).toBe(LUIS);
    await expect(panel.reasignarCita(cita, NOTARIO)).rejects.toThrow(/matricero/);
    await panel.reasignarCita(cita, "");
    expect((await almacen.cita(cita)).atiendeEmail).toBe("");
  });

  it("Mi turno separa lo mío, lo libre y lo de otros, sin celulares", async () => {
    const conv = await almacen.conversacion("form:593990000102", "Otro");
    const otra = (await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-27", hora: "11:00", nombre: "Otro", contacto: "593990000102", estado: "confirmada" })).id;
    await panel.atenderCita(cita, ANA); await panel.atenderCita(otra, LUIS);
    const t = await panel.miTurno(ANA);
    expect(t.mias.map((x) => x.id)).toEqual([cita]);
    expect(t.deOtros.map((x) => x.id)).toEqual([otra]);
    expect(t.sinAsignar).toEqual([]);
    expect(JSON.stringify(t)).not.toMatch(/593990000/);
  });
});
