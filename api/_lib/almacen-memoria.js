// Adaptador en memoria del almacén: para pruebas y desarrollo local. Misma interfaz que almacen-supabase.js.
import { textoVisible } from "./mensajes.js";

export function crearAlmacenMemoria({ personal = [] } = {}) {
  const precios = new Map(), ajustes = {};
  const procesados = new Set(), convs = new Map(), sesiones = new Map();
  let archivos = [], docs = [], citas = [], pendientes = [];
  const turnos = new Map(), usos = new Map(), auditoria = [], conMfa = new Set();
  let seq = 0;
  const nuevoId = () => String(++seq);
  const copia = (x) => structuredClone(x);
  const porId = (id) => [...convs.values()].find((c) => c.id === id);

  return {
    async precios() { return [...precios.values()].map(copia); },
    async guardarPrecio(p) { precios.set(p.tramiteId, { unidad: "", tabla: "", actualizadoPor: "", ...copia(p), actualizadoEn: new Date().toISOString() }); },
    async restaurarPrecio(id) { precios.delete(id); },
    async ajustes() { return copia(ajustes); },
    async restaurarAjuste(clave) { delete ajustes[clave]; },
    async guardarAjuste(clave, valor, por) { ajustes[clave] = clave === "sbu" ? Number(valor) : String(valor); },
    async esAdmin(email) { return personal.some((p) => p.email.toLowerCase() === String(email).toLowerCase() && p.rol === "admin"); },
    async marcarProcesado(waId) {
      if (procesados.has(waId)) return false;
      procesados.add(waId);
      return true;
    },
    async conversacion(telefono, nombre) {
      let c = convs.get(telefono);
      if (!c) { c = { id: nuevoId(), telefono, nombre: nombre || "", consentimiento: false, derivada: false, creada: Date.now() }; convs.set(telefono, c); }
      else if (nombre && !c.nombre) c.nombre = nombre;
      return copia(c);
    },
    // Busca sin crear (conversacion() crea si no existe).
    async conversacionPorTelefono(telefono) { return copia(convs.get(telefono) || null); },
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
    async documento(id) { return copia(docs.find((d) => d.id === id && !d.borradoEn) || null); },
    async revisarDocumento(id, { estado, nota = "" }) { Object.assign(docs.find((d) => d.id === id), { estado, nota }); },
    async documentos(conversacionId) { return docs.filter((d) => d.conversacionId === conversacionId && !d.borradoEn).map(copia); },
    // Borrado recuperable: deja de verse; purgar() elimina el archivo después.
    async borrarDocumento(id, { por = "", ahora = Date.now() } = {}) { const d = docs.find((x) => x.id === id); if (d && !d.borradoEn) Object.assign(d, { borradoEn: ahora, borradoPor: por }); },
    async urlDocumento(id) { return docs.some((d) => d.id === id && !d.borradoEn) ? `memoria://documentos/${id}` : null; },

    async crearSolicitudCita(c) {
      for (let intento = 0; intento < 8; intento++) {
        const codigo = String(1000 + Math.floor(Math.random() * 9000));
        if (citas.some((x) => x.fecha === c.fecha && x.codigo === codigo)) continue;
        const x = { id: nuevoId(), estado: "pendiente", asignadaA: "", ...c, codigo };
        citas.push(x);
        return { id: x.id, codigo };
      }
      throw new Error("No se pudo generar un ticket único para ese día.");
    },
    async citasPorCodigo(codigo, desdeFecha) {
      return citas.filter((c) => c.codigo === codigo && c.fecha >= desdeFecha && ["pendiente", "confirmada"].includes(c.estado))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
        .map((c) => ({ ...copia(c), telefono: c.contacto || (porId(c.conversacionId) || {}).telefono, telefonoConversacion: (porId(c.conversacionId) || {}).telefono }));
    },
    async solicitudesCita(conversacionId) { return citas.filter((c) => c.conversacionId === conversacionId).map(copia); },
    async cita(id) { return copia(citas.find((c) => c.id === id) || null); },
    async actualizarCita(id, cambios) { Object.assign(citas.find((c) => c.id === id), cambios); },
    async marcarRecordada(id) { citas.find((c) => c.id === id).recordada = true; },
    async citasEntre(desde, hasta) {
      const fechas = [...new Set(citas.filter(c => c.fecha >= desde && c.fecha <= hasta).map(c => c.fecha))].sort();
      return (await Promise.all(fechas.map(f => this.agenda(f)))).flat();
    },
    async agenda(fecha) {
      return citas.filter((c) => c.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora))
        .map((c) => ({ ...copia(c), telefono: c.contacto || (porId(c.conversacionId) || {}).telefono, telefonoConversacion: (porId(c.conversacionId) || {}).telefono }));
    },
    async listaPersonal() { return []; },
    async citasDelDia(fecha) {
      return citas.filter((c) => c.fecha === fecha && c.estado === "confirmada" && !c.recordada)
        .map((c) => ({ ...copia(c), telefono: c.contacto || (porId(c.conversacionId) || {}).telefono, telefonoConversacion: (porId(c.conversacionId) || {}).telefono }));
    },
    async contarUso(clave, ventanaMs, ahora) {
      const k = clave + "|" + Math.floor(ahora / ventanaMs);
      usos.set(k, (usos.get(k) || 0) + 1);
      return usos.get(k);
    },
    // Registro de quién hizo qué en el panel (solo se agrega, nunca se edita).
    async auditar(e) { auditoria.push({ creado: Date.now(), ...copia(e) }); },
    async auditoria() { return auditoria.map(copia); },
    // true solo la primera vez que esa cuenta entra con verificación en dos pasos.
    async marcarMfa(email) { if (conMfa.has(email)) return false; conMfa.add(email); return true; },

    // Retención: borra las conversaciones sin actividad desde `inactivasAntesDe` (salvo las que tienen una cita por venir)
    // y los documentos borrados desde el panel antes de `borradosAntesDe`.
    async purgar({ inactivasAntesDe, borradosAntesDe, hoy }) {
      const conCita = new Set(citas.filter((x) => x.fecha >= hoy && (x.estado === "pendiente" || x.estado === "confirmada")).map((x) => x.conversacionId));
      const actividad = (c) => Math.max(c.creada || 0, c.clienteEn || 0, ...[...sesiones.values()].filter((x) => x.conversacionId === c.id).map((x) => x.ultima));
      const viejas = new Set([...convs.values()].filter((c) => actividad(c) < inactivasAntesDe && !conCita.has(c.id)).map((c) => c.id));
      const antes = docs.length;
      docs = docs.filter((d) => !viejas.has(d.conversacionId) && !(d.borradoEn && d.borradoEn < borradosAntesDe));
      for (const [tel, c] of convs) if (viejas.has(c.id)) convs.delete(tel);
      for (const [id, x] of sesiones) if (viejas.has(x.conversacionId)) sesiones.delete(id);
      citas = citas.filter((x) => !viejas.has(x.conversacionId));
      archivos = archivos.filter((x) => !viejas.has(x.conversacionId));
      pendientes = pendientes.filter((x) => !viejas.has(x.conversacionId));
      return { conversaciones: viejas.size, documentos: antes - docs.length };
    }
  };
}
