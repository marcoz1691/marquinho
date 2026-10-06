// Contrato del almacén: el adaptador en memoria y el de Supabase deben comportarse igual.
// El de Supabase solo corre si existen SUPABASE_URL_PRUEBA y SUPABASE_KEY_PRUEBA (un proyecto de pruebas, nunca producción).
import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearAlmacenSupabase } from "../api/_lib/almacen-supabase.js";

const adaptadores = [["memoria", () => crearAlmacenMemoria()]];
if (process.env.SUPABASE_URL_PRUEBA && process.env.SUPABASE_KEY_PRUEBA) {
  adaptadores.push(["supabase", () => crearAlmacenSupabase({ url: process.env.SUPABASE_URL_PRUEBA, clave: process.env.SUPABASE_KEY_PRUEBA })]);
}
const tel = () => "5939" + Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
const DIA = 864e5;

describe.each(adaptadores)("almacén %s", (_, crear) => {
  it("marca cada mensaje de WhatsApp una sola vez", async () => {
    const a = crear(), id = "wamid.test." + Math.random();
    expect(await a.marcarProcesado(id)).toBe(true);
    expect(await a.marcarProcesado(id)).toBe(false);
  });

  it("crea la conversación una vez por teléfono y la actualiza", async () => {
    const a = crear(), t = tel();
    const c1 = await a.conversacion(t, "Ana"), c2 = await a.conversacion(t);
    expect(c2.id).toBe(c1.id);
    expect(c1).toMatchObject({ telefono: t, nombre: "Ana", consentimiento: false, derivada: false });
    await a.actualizarConversacion(c1.id, { derivada: true, consentimiento: true });
    expect(await a.conversacionPorId(c1.id)).toMatchObject({ derivada: true, consentimiento: true });
  });

  it("mantiene la sesión mientras hay actividad y la renueva tras la inactividad", async () => {
    const a = crear(), c = await a.conversacion(tel());
    const s1 = await a.sesionActiva(c.id, { ahora: 1000, sistema: "S1", inactividadMs: DIA });
    await a.agregarMensajes(s1.id, [{ role: "user", content: "hola" }, { role: "assistant", content: [{ type: "text", text: "hola" }] }], 2000);
    const s2 = await a.sesionActiva(c.id, { ahora: 3000, sistema: "S2", inactividadMs: DIA });
    expect(s2).toMatchObject({ id: s1.id, sistema: "S1" });
    expect(s2.mensajes).toEqual([{ role: "user", content: "hola" }, { role: "assistant", content: [{ type: "text", text: "hola" }] }]);
    const s3 = await a.sesionActiva(c.id, { ahora: 2000 + DIA + 1, sistema: "S3", inactividadMs: DIA });
    expect(s3.id).not.toBe(s1.id);
    expect(s3.mensajes).toEqual([]);
    expect(await a.historial(c.id)).toHaveLength(2);
    await a.marcarClienteEscribio(c.id, 2500);
    await a.marcarClienteEscribio(c.id, 1500); // un webhook atrasado no retrocede la hora
    expect(await a.ultimoMensajeCliente(c.id)).toBe(2500);
  });

  it("solo reconoce archivos recibidos en la misma conversación", async () => {
    const a = crear(), c1 = await a.conversacion(tel()), c2 = await a.conversacion(tel()), mid = "M" + Math.random();
    await a.registrarArchivo(c1.id, { id: mid, mime: "application/pdf", nombre: "c.pdf" });
    expect(await a.archivoRecibido(c1.id, mid)).toMatchObject({ id: mid, mime: "application/pdf" });
    expect(await a.archivoRecibido(c2.id, mid)).toBeNull();
  });

  it("guarda, lista, enlaza y borra documentos", async () => {
    const a = crear(), c = await a.conversacion(tel());
    const { id } = await a.guardarDocumento({ conversacionId: c.id, mediaId: "M1", nombre: "c.pdf", mime: "application/pdf", bytes: new Uint8Array([1, 2]), descripcion: "cédula", tramiteId: "poder" });
    expect((await a.documentos(c.id))[0]).toMatchObject({ id, descripcion: "cédula", tramiteId: "poder", mime: "application/pdf" });
    expect(await a.urlDocumento(id)).toBeTruthy();
    await a.borrarDocumento(id);
    expect(await a.documentos(c.id)).toEqual([]);
  });

  it("crea solicitudes de cita pendientes y cambia su estado", async () => {
    const a = crear(), c = await a.conversacion(tel());
    const { id } = await a.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Ana", nota: "" });
    expect(await a.cita(id)).toMatchObject({ estado: "pendiente", fecha: "2026-10-08", hora: "10:00", conversacionId: c.id });
    await a.actualizarCita(id, { estado: "confirmada", motivo: "" });
    expect((await a.solicitudesCita(c.id))[0].estado).toBe("confirmada");
  });

  it("lista las citas confirmadas de un día con el teléfono del cliente", async () => {
    const a = crear(), t = tel(), c = await a.conversacion(t, "Eva"), fecha = "2031-0" + (1 + Math.floor(Math.random() * 9)) + "-15";
    const { id } = await a.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha, hora: "09:30", nombre: "Eva" });
    await a.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha, hora: "11:00", nombre: "Eva" });
    await a.actualizarCita(id, { estado: "confirmada" });
    const lista = (await a.citasDelDia(fecha)).filter((x) => x.conversacionId === c.id);
    expect(lista).toEqual([expect.objectContaining({ id, hora: "09:30", telefono: t, estado: "confirmada" })]);
  });

  it("cola y turno: solo una invocación toma el turno hasta liberarlo o hasta que venza", async () => {
    const a = crear(), c = await a.conversacion(tel());
    await a.encolar(c.id, { id: "w1", texto: "Hola" });
    await a.encolar(c.id, { id: "w2", texto: "¿Precio?" });
    expect(await a.tomarTurno(c.id, 1000, 5000)).toBe(true);
    expect(await a.tomarTurno(c.id, 2000, 5000)).toBe(false);
    const p = await a.pendientes(c.id);
    expect(p.map((x) => x.mensaje.texto)).toEqual(["Hola", "¿Precio?"]);
    await a.quitarPendientes([p[0].id]);
    expect((await a.pendientes(c.id)).map((x) => x.mensaje.id)).toEqual(["w2"]);
    await a.liberarTurno(c.id);
    expect(await a.tomarTurno(c.id, 3000, 5000)).toBe(true);
    expect(await a.tomarTurno(c.id, 9000, 5000)).toBe(true); // el turno anterior venció
  });

  it("revisa documentos con estado y nota", async () => {
    const a = crear(), c = await a.conversacion(tel());
    const { id } = await a.guardarDocumento({ conversacionId: c.id, mediaId: "M1", nombre: "c.pdf", mime: "application/pdf", bytes: new Uint8Array([1]), descripcion: "cédula" });
    expect(await a.documento(id)).toMatchObject({ estado: "recibido", nota: "" });
    await a.revisarDocumento(id, { estado: "observado", nota: "borrosa" });
    expect(await a.documento(id)).toMatchObject({ estado: "observado", nota: "borrosa" });
    await a.borrarDocumento(id);
  });

  it("resume las conversaciones con su último texto visible y citas pendientes", async () => {
    const a = crear(), c = await a.conversacion(tel(), "Rosa");
    const s = await a.sesionActiva(c.id, { ahora: 7000, sistema: "S", inactividadMs: DIA });
    await a.agregarMensajes(s.id, [{ role: "user", content: "¿Atienden el sábado?" }, { role: "system", content: "Fecha" },
      { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "No, de lunes a viernes." }] }], 8000);
    await a.crearSolicitudCita({ conversacionId: c.id, tramiteId: null, fecha: "2031-01-02", hora: "10:00", nombre: "Rosa" });
    expect((await a.resumenConversaciones()).find((x) => x.id === c.id)).toMatchObject({ nombre: "Rosa", ultimoTexto: "No, de lunes a viernes.", ultimaActividad: 8000, citasPendientes: 1 });
  });

  it("marca una cita como recordada para no repetir el recordatorio", async () => {
    const a = crear(), c = await a.conversacion(tel()), fecha = "2032-0" + (1 + Math.floor(Math.random() * 9)) + "-20";
    const { id } = await a.crearSolicitudCita({ conversacionId: c.id, fecha, hora: "10:00", nombre: "X" });
    await a.actualizarCita(id, { estado: "confirmada" });
    await a.marcarRecordada(id);
    expect((await a.citasDelDia(fecha)).filter((x) => x.id === id)).toEqual([]);
  });

  it("lista conversaciones con su última actividad", async () => {
    const a = crear(), c = await a.conversacion(tel(), "Luis");
    const s = await a.sesionActiva(c.id, { ahora: 5000, sistema: "S", inactividadMs: DIA });
    await a.agregarMensajes(s.id, [{ role: "user", content: "hola" }], 6000);
    expect((await a.conversaciones()).find((x) => x.id === c.id)).toMatchObject({ nombre: "Luis", ultimaActividad: 6000 });
  });
});
