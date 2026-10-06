// Adaptador en memoria del almacén: para pruebas y desarrollo local. Misma interfaz que almacen-supabase.js.
import { textoVisible } from "./mensajes.js";

export function crearAlmacenMemoria() {
  const procesados = new Set(), convs = new Map(), sesiones = new Map();
  const archivos = [], docs = [], citas = [], pendientes = [];
  const turnos = new Map(), usos = new Map();
  let seq = 0;
  const nuevoId = () => String(++seq);
  const copia = (x) => structuredClone(x);
  const porId = (id) => [...convs.values()].find((c) => c.id === id);

  return {
    async marcarProcesado(waId) {
      if (procesados.has(waId)) return false;
      procesados.add(waId);
      return true;
    },
    async conversacion(telefono, nombre) {
      let c = convs.get(telefono);
      if (!c) { c = { id: nuevoId(), telefono, nombre: nombre || "", consentimiento: false, derivada: false }; convs.set(telefono, c); }
      else if (nombre && !c.nombre) c.nombre = nombre;
      return copia(c);
    },
    async conversacionPorId(id) { return copia(porId(id) || null); },
    async actualizarConversacion(id, cambios) { Object.assign(porId(id), cambios); },
    async resumenConversaciones() {
      return (await this.conversaciones()).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, derivada: c.derivada,
        ultimaActividad: c.ultimaActividad, ultimoTexto: c.ultimoTexto || "",
        citasPendientes: citas.filter((x) => x.conversacionId === c.id && x.estado === "pendiente").length }));
    },
    async conversaciones() {
      return [...convs.values()].map((c) => {
        const ss = [...sesiones.values()].filter((s) => s.conversacionId === c.id);
        return { ...copia(c), ultimaActividad: Math.max(0, ...ss.map((s) => s.ultima)) };
      });
    },

    // Sesión = tramo de conversación que se envía al modelo. Se renueva tras `inactividadMs` sin mensajes o si se pide `nueva`.
    async sesionActiva(conversacionId, { ahora, sistema, inactividadMs, nueva = false }) {
      let s = [...sesiones.values()].filter((x) => x.conversacionId === conversacionId).at(-1);
      if (nueva || !s || ahora - s.ultima > inactividadMs) {
        s = { id: nuevoId(), conversacionId, sistema, mensajes: [], ultima: ahora };
        sesiones.set(s.id, s);
      }
      return { id: s.id, sistema: s.sistema, mensajes: copia(s.mensajes) };
    },
    async sesionActual(conversacionId) {
      const s = [...sesiones.values()].filter((x) => x.conversacionId === conversacionId).at(-1);
      return s ? { id: s.id, sistema: s.sistema, mensajes: copia(s.mensajes) } : null;
    },
    async agregarMensajes(sesionId, mensajes, ahora) {
      const s = sesiones.get(sesionId);
      s.mensajes.push(...copia(mensajes));
      s.ultima = ahora;
      const visible = mensajes.map(textoVisible).filter(Boolean).at(-1);
      if (visible) porId(s.conversacionId).ultimoTexto = visible.texto;
    },
    // Momento (ms) del último mensaje escrito por el cliente: define la ventana de 24 h de WhatsApp.
    async marcarClienteEscribio(conversacionId, ms) { const c = porId(conversacionId); c.clienteEn = Math.max(c.clienteEn || 0, ms); },

    // Cola y turno por conversación: solo una invocación responde a la vez.
    async encolar(conversacionId, mensaje) { pendientes.push({ id: nuevoId(), conversacionId, mensaje: copia(mensaje) }); },
    async pendientes(conversacionId) { return pendientes.filter((p) => p.conversacionId === conversacionId).map(copia); },
    async quitarPendientes(ids) { for (const id of ids) { const i = pendientes.findIndex((p) => p.id === id); if (i > -1) pendientes.splice(i, 1); } },
    async tomarTurno(conversacionId, ahora, duracionMs) {
      const t = turnos.get(conversacionId);
      if (t && t > ahora) return false;
      turnos.set(conversacionId, ahora + duracionMs);
      return true;
    },
    async liberarTurno(conversacionId) { turnos.delete(conversacionId); },

    async ultimoMensajeCliente(conversacionId) { return (porId(conversacionId) || {}).clienteEn || 0; },
    async historial(conversacionId) {
      return [...sesiones.values()].filter((s) => s.conversacionId === conversacionId).flatMap((s) => copia(s.mensajes));
    },

    async registrarArchivo(conversacionId, media) { archivos.push({ conversacionId, ...media }); },
    async archivoRecibido(conversacionId, mediaId) {
      return copia(archivos.find((a) => a.conversacionId === conversacionId && a.id === mediaId) || null);
    },
    async guardarDocumento(d) { const doc = { id: nuevoId(), creado: Date.now(), estado: "recibido", nota: "", ...d }; docs.push(doc); return { id: doc.id }; },
    async documento(id) { return copia(docs.find((d) => d.id === id) || null); },
    async revisarDocumento(id, { estado, nota = "" }) { Object.assign(docs.find((d) => d.id === id), { estado, nota }); },
    async documentos(conversacionId) { return docs.filter((d) => d.conversacionId === conversacionId).map(copia); },
    async borrarDocumento(id) { const i = docs.findIndex((d) => d.id === id); if (i > -1) docs.splice(i, 1); },
    async urlDocumento(id) { return docs.some((d) => d.id === id) ? `memoria://documentos/${id}` : null; },

    async crearSolicitudCita(c) { const x = { id: nuevoId(), estado: "pendiente", asignadaA: "", ...c }; citas.push(x); return { id: x.id }; },
    async solicitudesCita(conversacionId) { return citas.filter((c) => c.conversacionId === conversacionId).map(copia); },
    async cita(id) { return copia(citas.find((c) => c.id === id) || null); },
    async actualizarCita(id, cambios) { Object.assign(citas.find((c) => c.id === id), cambios); },
    async marcarRecordada(id) { citas.find((c) => c.id === id).recordada = true; },
    async agenda(fecha) {
      return citas.filter((c) => c.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora))
        .map((c) => ({ ...copia(c), telefono: c.contacto || (porId(c.conversacionId) || {}).telefono }));
    },
    async listaPersonal() { return []; },
    async citasDelDia(fecha) {
      return citas.filter((c) => c.fecha === fecha && c.estado === "confirmada" && !c.recordada)
        .map((c) => ({ ...copia(c), telefono: c.contacto || (porId(c.conversacionId) || {}).telefono }));
    },
    async contarUso(clave, ventanaMs, ahora) {
      const k = clave + "|" + Math.floor(ahora / ventanaMs);
      usos.set(k, (usos.get(k) || 0) + 1);
      return usos.get(k);
    }
  };
}
