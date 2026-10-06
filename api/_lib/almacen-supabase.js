// Adaptador del almacén sobre Supabase (Postgres + Storage). Misma interfaz que almacen-memoria.js.
// Usa la clave service_role: solo debe correr en el servidor.
import { createClient } from "@supabase/supabase-js";
import { textoVisible } from "./mensajes.js";

const BUCKET = "documentos";

export function crearAlmacenSupabase({ url, clave, cliente } = {}) {
  const db = cliente || createClient(url, clave, { auth: { persistSession: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(`Supabase: ${error.message}`); return data; };
  const conv = (r) => r && { id: r.id, telefono: r.telefono, nombre: r.nombre, consentimiento: r.consentimiento, derivada: r.derivada };
  const cita = (r) => r && { id: r.id, conversacionId: r.conversacion_id, tramiteId: r.tramite_id, fecha: r.fecha, hora: r.hora, nombre: r.nombre, nota: r.nota, estado: r.estado, motivo: r.motivo };
  const doc = (r) => ({ id: r.id, conversacionId: r.conversacion_id, mediaId: r.media_id, nombre: r.nombre, mime: r.mime, descripcion: r.descripcion, tramiteId: r.tramite_id,
    estado: r.estado, nota: r.nota, creado: Date.parse(r.creado) });
  const mensajesDe = async (filtro, valor) => ok(await db.from("mensajes").select("contenido").eq(filtro, valor).order("id")).map((m) => m.contenido);

  return {
    async marcarProcesado(waId) {
      const { error } = await db.from("procesados").insert({ wa_id: waId });
      if (error?.code === "23505") return false;
      if (error) throw new Error(`Supabase: ${error.message}`);
      return true;
    },

    async conversacion(telefono, nombre) {
      let r = ok(await db.from("conversaciones").select("*").eq("telefono", telefono).maybeSingle());
      if (!r) {
        const ins = await db.from("conversaciones").insert({ telefono, nombre: nombre || "" }).select().single();
        r = ins.error?.code === "23505" ? ok(await db.from("conversaciones").select("*").eq("telefono", telefono).single()) : ok(ins);
      } else if (nombre && !r.nombre) {
        r = ok(await db.from("conversaciones").update({ nombre }).eq("id", r.id).select().single());
      }
      return conv(r);
    },
    async conversacionPorId(id) { return conv(ok(await db.from("conversaciones").select("*").eq("id", id).maybeSingle())); },
    async actualizarConversacion(id, cambios) {
      const fila = {};
      if ("derivada" in cambios) fila.derivada = cambios.derivada;
      if ("consentimiento" in cambios) fila.consentimiento = cambios.consentimiento;
      if ("consentimientoEn" in cambios) fila.consentimiento_en = cambios.consentimientoEn;
      if ("nombre" in cambios) fila.nombre = cambios.nombre;
      ok(await db.from("conversaciones").update(fila).eq("id", id));
    },
    async resumenConversaciones() {
      const filas = ok(await db.from("conversaciones").select("id, nombre, telefono, derivada, ultimo_texto, ultima_actividad_ms, solicitudes_cita(count)")
        .eq("solicitudes_cita.estado", "pendiente").order("ultima_actividad_ms", { ascending: false }).limit(200));
      return filas.map((r) => ({ id: r.id, nombre: r.nombre, telefono: r.telefono, derivada: r.derivada, ultimoTexto: r.ultimo_texto,
        ultimaActividad: Number(r.ultima_actividad_ms), citasPendientes: r.solicitudes_cita?.[0]?.count || 0 }));
    },
    async conversaciones() {
      const filas = ok(await db.from("conversaciones").select("*, sesiones(ultima_ms)"));
      return filas.map((r) => ({ ...conv(r), ultimaActividad: Math.max(0, ...(r.sesiones || []).map((s) => Number(s.ultima_ms))) }));
    },

    async sesionActiva(conversacionId, { ahora, sistema, inactividadMs, nueva = false }) {
      let s = ok(await db.from("sesiones").select("*").eq("conversacion_id", conversacionId).order("creada", { ascending: false }).limit(1).maybeSingle());
      if (nueva || !s || ahora - Number(s.ultima_ms) > inactividadMs) {
        s = ok(await db.from("sesiones").insert({ conversacion_id: conversacionId, sistema, ultima_ms: ahora }).select().single());
        return { id: s.id, sistema: s.sistema, mensajes: [] };
      }
      return { id: s.id, sistema: s.sistema, mensajes: await mensajesDe("sesion_id", s.id) };
    },
    async sesionActual(conversacionId) {
      const s = ok(await db.from("sesiones").select("*").eq("conversacion_id", conversacionId).order("creada", { ascending: false }).limit(1).maybeSingle());
      return s ? { id: s.id, sistema: s.sistema, mensajes: await mensajesDe("sesion_id", s.id) } : null;
    },
    async agregarMensajes(sesionId, mensajes, ahora) {
      const s = ok(await db.from("sesiones").select("conversacion_id").eq("id", sesionId).single());
      if (mensajes.length) ok(await db.from("mensajes").insert(mensajes.map((m) => ({ sesion_id: sesionId, conversacion_id: s.conversacion_id, rol: m.role, contenido: m }))));
      ok(await db.from("sesiones").update({ ultima_ms: ahora }).eq("id", sesionId));
      const visible = mensajes.map(textoVisible).filter(Boolean).at(-1);
      ok(await db.from("conversaciones").update({ ultima_actividad_ms: ahora, ...(visible ? { ultimo_texto: visible.texto.slice(0, 300) } : {}) }).eq("id", s.conversacion_id));
    },
    async ultimoMensajeCliente(conversacionId) {
      return Number(ok(await db.from("conversaciones").select("cliente_en_ms").eq("id", conversacionId).single()).cliente_en_ms);
    },
    async historial(conversacionId) { return mensajesDe("conversacion_id", conversacionId); },
    async marcarClienteEscribio(conversacionId, ms) {
      ok(await db.from("conversaciones").update({ cliente_en_ms: ms }).eq("id", conversacionId).lt("cliente_en_ms", ms));
    },

    // Cola y turno por conversación. El turno se toma con una sola actualización condicional (atómica en Postgres).
    async encolar(conversacionId, mensaje) { ok(await db.from("pendientes").insert({ conversacion_id: conversacionId, mensaje })); },
    async pendientes(conversacionId) {
      return ok(await db.from("pendientes").select("id, mensaje").eq("conversacion_id", conversacionId).order("id")).map((r) => ({ id: r.id, conversacionId, mensaje: r.mensaje }));
    },
    async quitarPendientes(ids) { if (ids.length) ok(await db.from("pendientes").delete().in("id", ids)); },
    async tomarTurno(conversacionId, ahora, duracionMs) {
      return ok(await db.from("conversaciones").update({ turno_hasta_ms: ahora + duracionMs }).eq("id", conversacionId).lt("turno_hasta_ms", ahora).select("id")).length > 0;
    },
    async liberarTurno(conversacionId) { ok(await db.from("conversaciones").update({ turno_hasta_ms: 0 }).eq("id", conversacionId)); },

    async registrarArchivo(conversacionId, media) {
      ok(await db.from("archivos").upsert({ id: media.id, conversacion_id: conversacionId, mime: media.mime || "", nombre: media.nombre || "" }));
    },
    async archivoRecibido(conversacionId, mediaId) {
      const r = ok(await db.from("archivos").select("*").eq("conversacion_id", conversacionId).eq("id", mediaId).maybeSingle());
      return r ? { id: r.id, mime: r.mime, nombre: r.nombre } : null;
    },

    async guardarDocumento(d) {
      const ruta = `${d.conversacionId}/${crypto.randomUUID()}-${(d.nombre || "archivo").replace(/[^\w.\-]+/g, "_")}`;
      ok(await db.storage.from(BUCKET).upload(ruta, d.bytes, { contentType: d.mime || "application/octet-stream" }));
      const r = ok(await db.from("documentos").insert({ conversacion_id: d.conversacionId, media_id: d.mediaId, nombre: d.nombre || "", mime: d.mime || "",
        ruta, descripcion: d.descripcion || "", tramite_id: d.tramiteId || null }).select("id").single());
      return { id: r.id };
    },
    async documento(id) { const r = ok(await db.from("documentos").select("*").eq("id", id).maybeSingle()); return r ? doc(r) : null; },
    async revisarDocumento(id, { estado, nota = "" }) { ok(await db.from("documentos").update({ estado, nota }).eq("id", id)); },
    async documentos(conversacionId) { return ok(await db.from("documentos").select("*").eq("conversacion_id", conversacionId).order("creado")).map(doc); },
    async borrarDocumento(id) {
      const r = ok(await db.from("documentos").select("ruta").eq("id", id).maybeSingle());
      if (!r) return;
      ok(await db.storage.from(BUCKET).remove([r.ruta]));
      ok(await db.from("documentos").delete().eq("id", id));
    },
    async urlDocumento(id) {
      const r = ok(await db.from("documentos").select("ruta").eq("id", id).maybeSingle());
      return r ? ok(await db.storage.from(BUCKET).createSignedUrl(r.ruta, 120)).signedUrl : null;
    },

    async crearSolicitudCita(c) {
      const r = ok(await db.from("solicitudes_cita").insert({ conversacion_id: c.conversacionId, tramite_id: c.tramiteId || null, fecha: c.fecha, hora: c.hora,
        nombre: c.nombre, nota: c.nota || "" }).select("id").single());
      return { id: r.id };
    },
    async solicitudesCita(conversacionId) { return ok(await db.from("solicitudes_cita").select("*").eq("conversacion_id", conversacionId).order("creada")).map(cita); },
    async cita(id) { return cita(ok(await db.from("solicitudes_cita").select("*").eq("id", id).maybeSingle())); },
    async actualizarCita(id, cambios) {
      const fila = {};
      if ("estado" in cambios) fila.estado = cambios.estado;
      if ("motivo" in cambios) fila.motivo = cambios.motivo;
      ok(await db.from("solicitudes_cita").update(fila).eq("id", id));
    },

    async marcarRecordada(id) { ok(await db.from("solicitudes_cita").update({ recordada: true }).eq("id", id)); },
    async citasDelDia(fecha) {
      const filas = ok(await db.from("solicitudes_cita").select("*, conversaciones(telefono)").eq("fecha", fecha).eq("estado", "confirmada").eq("recordada", false).order("hora"));
      return filas.map((r) => ({ ...cita(r), telefono: r.conversaciones?.telefono }));
    },

    // Para el panel: comprueba que el usuario autenticado pertenece al personal.
    // Los correos de la tabla "personal" se guardan en minúsculas.
    async esPersonal(email) { return !!ok(await db.from("personal").select("email").eq("email", String(email || "").toLowerCase()).maybeSingle()); },
    async usuarioDeToken(token) { const { data, error } = await db.auth.getUser(token); return error ? null : data.user; }
  };
}
