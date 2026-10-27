import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearPanel } from "../api/_lib/panel.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";

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
    const r = await Promise.allSettled([panel.encolarCita(cita, ANA), panel.encolarCita(cita, LUIS)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const perdio = r.find((x) => x.status === "rejected").reason;
    expect(perdio.message).toMatch(/Ya la lleva (Ana|Luis)/);
    expect(perdio.status).toBe(409);
  });

  it("atender de nuevo la propia cita no falla y devolverla la libera", async () => {
    await panel.encolarCita(cita, ANA);
    expect(await panel.encolarCita(cita, ANA)).toEqual({ ya: true });
    await expect(panel.devolverCita(cita, LUIS)).rejects.toThrow(/la lleva Ana/);
    await panel.devolverCita(cita, ANA);
    expect((await almacen.cita(cita)).atiendeEmail).toBe("");
    await panel.encolarCita(cita, LUIS);
    expect((await almacen.cita(cita)).atiendeNombre).toBe("Luis");
  });

  it("los documentos los revisa solo quien atiende; el notario siempre puede", async () => {
    await expect(panel.revisarDocumento(doc, "aprobado", "", undefined, ANA)).rejects.toThrow(/cola/);
    await panel.encolarCita(cita, ANA);
    await expect(panel.revisarDocumento(doc, "aprobado", "", undefined, LUIS)).rejects.toThrow(/la lleva Ana/);
    await expect(panel.urlDocumento(doc, LUIS)).rejects.toThrow(/la lleva Ana/);
    await panel.revisarDocumento(doc, "aprobado", "", undefined, ANA);
    expect((await almacen.documento(doc)).estado).toBe("aprobado");
    await panel.revisarDocumento(doc, "observado", "borrosa", undefined, NOTARIO);
    expect((await almacen.documento(doc)).estado).toBe("observado");
  });

  it("terminar exige haber iniciado la atención y ser quien la lleva", async () => {
    await expect(panel.terminarCita(cita, ANA)).rejects.toThrow(/cola/);
    await panel.encolarCita(cita, ANA);
    await expect(panel.terminarCita(cita, ANA)).rejects.toThrow(/Atender ahora/);
    await expect(panel.iniciarCita(cita, LUIS)).rejects.toThrow(/la lleva Ana/);
    await panel.iniciarCita(cita, ANA);
    await expect(panel.terminarCita(cita, LUIS)).rejects.toThrow(/la lleva Ana/);
    await panel.terminarCita(cita, ANA);
    expect((await almacen.cita(cita)).estado).toBe("atendida");
    await expect(panel.devolverCita(cita, ANA)).rejects.toThrow(/ya se atendió/);
  });

  it("solo atiende a una persona a la vez; devolver o reasignar la saca de «atendiendo»", async () => {
    const conv = await almacen.conversacion("form:593990000103", "Otro");
    const otra = (await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-27", hora: "11:00", nombre: "Otro", contacto: "593990000103", estado: "confirmada" })).id;
    await panel.encolarCita(cita, ANA); await panel.encolarCita(otra, ANA);
    await panel.iniciarCita(cita, ANA);
    expect(await panel.iniciarCita(cita, ANA)).toEqual({ ya: true });
    await expect(panel.iniciarCita(otra, ANA)).rejects.toThrow(/Ya estás atendiendo a Cliente/);
    await panel.reasignarCita(cita, LUIS);
    expect((await almacen.cita(cita)).atencionInicio).toBeNull();
    await panel.iniciarCita(otra, ANA);
    await panel.devolverCita(otra, ANA);
    expect((await almacen.cita(otra)).atencionInicio).toBeNull();
  });

  it("el notario reasigna a un matricero y no a cualquiera", async () => {
    await panel.encolarCita(cita, ANA);
    await panel.reasignarCita(cita, LUIS);
    expect((await almacen.cita(cita)).atiendeEmail).toBe(LUIS);
    await expect(panel.reasignarCita(cita, NOTARIO)).rejects.toThrow(/matricero/);
    await panel.reasignarCita(cita, "");
    expect((await almacen.cita(cita)).atiendeEmail).toBe("");
  });

  it("Mi turno separa lo mío, lo libre y lo de otros, sin celulares", async () => {
    const conv = await almacen.conversacion("form:593990000102", "Otro");
    const otra = (await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-27", hora: "11:00", nombre: "Otro", contacto: "593990000102", estado: "confirmada" })).id;
    await panel.encolarCita(cita, ANA); await panel.encolarCita(otra, LUIS);
    const t = await panel.miTurno(ANA);
    expect(t.mias.map((x) => x.id)).toEqual([cita]);
    expect(t.deOtros.map((x) => x.id)).toEqual([otra]);
    expect(t.sinAsignar).toEqual([]);
    expect(JSON.stringify(t)).not.toMatch(/593990000/);
  });

  describe("por la API del panel", () => {
    const como = (email) => {
      almacen.usuarioDeToken = async () => ({ email, email_confirmed_at: "hoy", aal: "aal2" });
      const m = crearManejadorPanel({ panel, auth: almacen });
      return (b) => m.POST(new Request("https://sitio.ec/api/panel", { method: "POST", headers: { authorization: "Bearer t", origin: "https://sitio.ec" }, body: JSON.stringify(b) }));
    };
    it("un matricero no asigna citas a nadie, ni la marca atendida sin llevarla", async () => {
      const post = como(ANA);
      expect((await post({ accion: "asignarCita", id: cita, persona: "Luis" })).status).toBe(403);
      expect((await post({ accion: "reasignarCita", id: cita, persona: LUIS })).status).toBe(403);
      const r = await post({ accion: "cita", id: cita, estado: "atendida" });
      expect(r.status).toBe(409);
      expect((await r.json()).error).toMatch(/cola/);
      expect((await almacen.cita(cita)).estado).toBe("confirmada");
    });
    it("el notario sí asigna y reasigna", async () => {
      const post = como(NOTARIO);
      expect((await post({ accion: "asignarCita", id: cita, persona: "Ana" })).status).toBe(200);
      expect((await post({ accion: "reasignarCita", id: cita, persona: ANA })).status).toBe(200);
      expect((await almacen.cita(cita)).atiendeEmail).toBe(ANA);
    });
  });
});
