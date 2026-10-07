// Adaptador del almacén sobre Supabase (Postgres + Storage). Misma interfaz que almacen-memoria.js.
// Usa la clave service_role: solo debe correr en el servidor.
import { createClient } from "@supabase/supabase-js";
import { textoVisible } from "./mensajes.js";

const BUCKET = "documentos";

export function crearAlmacenSupabase({ url, clave, cliente } = {}) {
  const db = cliente || createClient(url, clave, { auth: { persistSession: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(`Supabase: ${error.message}`); return data; };
  const conv = (r) => r && { id: r.id, telefono: r.telefono, nombre: r.nombre, consentimiento: r.consentimiento, derivada: r.derivada,
    consentimientoTexto: r.consentimiento_texto || "", consentimientoAviso: r.consentimiento_aviso || "" };
  const cita = (r) => r && { id: r.id, conversacionId: r.conversacion_id, tramiteId: r.tramite_id, fecha: r.fecha, hora: r.hora, nombre: r.nombre, nota: r.nota, estado: r.estado, motivo: r.motivo, contacto: r.contacto || null, asignadaA: r.asignada_a || "" };
  const doc = (r) => ({ id: r.id, conversacionId: r.conversacion_id, mediaId: r.media_id, nombre: r.nombre, mime: r.mime, descripcion: r.descripcion, tramiteId: r.tramite_id,
    estado: r.estado, nota: r.nota, creado: Date.parse(r.creado) });
  const mensajesDe = async (filtro, valor) => ok(await db.from("mensajes").select("contenido").eq(filtro, valor).order("id")).map((m) => m.contenido);

  return {
    async precios() { return ok(await db.from("precios").select("*")).map((p) => ({ tramiteId: p.tramite_id, tipo: p.tipo, valor: p.valor === null ? null : Number(p.valor), unidad: p.unidad, tabla: p.tabla, actualizadoPor: p.actualizado_por, actualizadoEn: p.actualizado_en })); },
    async guardarPrecio(p) { ok(await db.from("precios").upsert({ tramite_id: p.tramiteId, tipo: p.tipo, valor: p.valor ?? null, unidad: p.unidad || "", tabla: p.tabla || "", actualizado_por: p.actualizadoPor || "", actualizado_en: new Date().toISOString() })); },
    async restaurarPrecio(id) { ok(await db.from("precios").delete().eq("tramite_id", id)); },
    async ajustes() { return Object.fromEntries(ok(await db.from("ajustes").select("clave, valor")).map((p) => [p.clave, p.clave === "sbu" ? Number(p.valor) : p.valor])); },
    async guardarAjuste(clave, valor, por) { ok(await db.from("ajustes").upsert({ clave, valor: String(valor), actualizado_por: por, actualizado_en: new Date().toISOString() })); },
    async esAdmin(email) { return !!ok(await db.from("personal").select("email").eq("email", String(email || "").toLowerCase()).eq("rol", "admin").maybeSingle()); },
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
      if ("consentimientoTexto" in cambios) fila.consentimiento_texto = cambios.consentimientoTexto;
      if ("consentimientoAviso" in cambios) fila.consentimiento_aviso = cambios.consentimientoAviso;
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
    async documento(id) { const r = ok(await db.from("documentos").select("*").eq("id", id).is("borrado_en", null).maybeSingle()); return r ? doc(r) : null; },
    async revisarDocumento(id, { estado, nota = "" }) { ok(await db.from("documentos").update({ estado, nota }).eq("id", id)); },
    async documentos(conversacionId) { return ok(await db.from("documentos").select("*").eq("conversacion_id", conversacionId).is("borrado_en", null).order("creado")).map(doc); },
    // Borrado recuperable: deja de verse; purgar() elimina el archivo después.
    async borrarDocumento(id, { por = "" } = {}) {
      ok(await db.from("documentos").update({ borrado_en: new Date().toISOString(), borrado_por: por }).eq("id", id).is("borrado_en", null));
    },
    async urlDocumento(id) {
      const r = ok(await db.from("documentos").select("ruta").eq("id", id).is("borrado_en", null).maybeSingle());
      return r ? ok(await db.storage.from(BUCKET).createSignedUrl(r.ruta, 120)).signedUrl : null;
    },

    async crearSolicitudCita(c) {
      const r = ok(await db.from("solicitudes_cita").insert({ conversacion_id: c.conversacionId, tramite_id: c.tramiteId || null, fecha: c.fecha, hora: c.hora,
        nombre: c.nombre, nota: c.nota || "", contacto: c.contacto || null, estado: c.estado || "pendiente" }).select("id").single());
      return { id: r.id };
    },
    async solicitudesCita(conversacionId) { return ok(await db.from("solicitudes_cita").select("*").eq("conversacion_id", conversacionId).order("creada")).map(cita); },
    async cita(id) { return cita(ok(await db.from("solicitudes_cita").select("*").eq("id", id).maybeSingle())); },
    async actualizarCita(id, cambios) {
      const fila = {};
      if ("estado" in cambios) fila.estado = cambios.estado;
      if ("motivo" in cambios) fila.motivo = cambios.motivo;
      if ("asignadaA" in cambios) fila.asignada_a = cambios.asignadaA;
      ok(await db.from("solicitudes_cita").update(fila).eq("id", id));
    },

    async marcarRecordada(id) { ok(await db.from("solicitudes_cita").update({ recordada: true }).eq("id", id)); },
    async agenda(fecha) {
      const filas = ok(await db.from("solicitudes_cita").select("*, conversaciones(telefono)").eq("fecha", fecha).order("hora").order("creada"));
      return filas.map((r) => ({ ...cita(r), telefono: r.contacto || r.conversaciones?.telefono }));
    },
    async listaPersonal() { return ok(await db.from("personal").select("email, nombre").order("nombre")); },
    async citasDelDia(fecha) {
      const filas = ok(await db.from("solicitudes_cita").select("*, conversaciones(telefono)").eq("fecha", fecha).eq("estado", "confirmada").eq("recordada", false).order("hora"));
      return filas.map((r) => ({ ...cita(r), telefono: r.contacto || r.conversaciones?.telefono }));
    },
    async contarUso(clave, ventanaMs, ahora) {
      return ok(await db.rpc("incrementar_uso", { p_clave: clave, p_ventana: Math.floor(ahora / ventanaMs) }));
    },

    async marcarMfa(email) {
      return ok(await db.from("personal").update({ mfa_en: new Date().toISOString() }).eq("email", email).is("mfa_en", null).select("email")).length > 0;
    },
    async auditar(e) { ok(await db.from("auditoria").insert({ email: e.email || "", accion: e.accion, objetivo: e.objetivo || "", ok: e.ok !== false })); },
    async auditoria() {
      return ok(await db.from("auditoria").select("*").order("id", { ascending: false }).limit(500))
        .map((r) => ({ creado: Date.parse(r.creado), email: r.email, accion: r.accion, objetivo: r.objetivo, ok: r.ok }));
    },

    // Retención: borra las conversaciones sin actividad desde `inactivasAntesDe` (salvo las que tienen una cita por venir)
    // y los documentos borrados desde el panel antes de `borradosAntesDe`.
    // Va en lotes pequeños (las listas de ids viajan en la URL). Primero se borran las filas y después los archivos: si el
    // almacenamiento falla queda un archivo huérfano (se avisa en el registro), nunca una fila con un enlace roto, y la purga
    // del día siguiente no repite el mismo error.
    async purgar({ inactivasAntesDe, borradosAntesDe, hoy }) {
      const LOTE = 50, LOTES = 4, corte = new Date(inactivasAntesDe).toISOString();
      let conversaciones = 0, documentos = 0;
      const quitarArchivos = async (rutas) => {
        if (!rutas.length) return;
        const { error } = await db.storage.from(BUCKET).remove(rutas);
        if (error) console.warn(`Purga: ${rutas.length} archivo(s) no se pudieron eliminar del almacenamiento: ${error.message}`);
      };
      for (let n = 0; n < LOTES; n++) {
        const candidatas = ok(await db.from("conversaciones").select("id").lt("ultima_actividad_ms", inactivasAntesDe).lt("cliente_en_ms", inactivasAntesDe)
          .lt("creada", corte).order("ultima_actividad_ms", { ascending: true }).limit(LOTE)).map((r) => r.id);
        if (!candidatas.length) break;
        const conCita = new Set(ok(await db.from("solicitudes_cita").select("conversacion_id").in("conversacion_id", candidatas)
          .gte("fecha", hoy).in("estado", ["pendiente", "confirmada"])).map((r) => r.conversacion_id));
        const viejas = candidatas.filter((id) => !conCita.has(id));
        if (!viejas.length) break;
        const rutas = ok(await db.from("documentos").select("ruta").in("conversacion_id", viejas)).map((d) => d.ruta);
        // Se repiten las condiciones: si el cliente escribió mientras tanto, esa conversación no se borra.
        const borradas = ok(await db.from("conversaciones").delete().in("id", viejas).lt("ultima_actividad_ms", inactivasAntesDe)
          .lt("cliente_en_ms", inactivasAntesDe).lt("creada", corte).select("id")).length;   // en cascada: sesiones, mensajes, citas, archivos y documentos
        await quitarArchivos(rutas);
        conversaciones += borradas; documentos += rutas.length;
        if (candidatas.length < LOTE) break;
      }
      for (let n = 0; n < LOTES; n++) {
        const lote = ok(await db.from("documentos").select("id, ruta").not("borrado_en", "is", null).lt("borrado_en", new Date(borradosAntesDe).toISOString()).limit(LOTE));
        if (!lote.length) break;
        ok(await db.from("documentos").delete().in("id", lote.map((d) => d.id)));
        await quitarArchivos(lote.map((d) => d.ruta));
        documentos += lote.length;
        if (lote.length < LOTE) break;
      }
      ok(await db.from("procesados").delete().lt("creado", new Date(Date.now() - 30 * 864e5).toISOString()));
      return { conversaciones, documentos };
    },

    // Para el panel: comprueba que el usuario autenticado pertenece al personal.
    // Los correos de la tabla "personal" se guardan en minúsculas.
    async esPersonal(email) { return !!ok(await db.from("personal").select("email").eq("email", String(email || "").toLowerCase()).maybeSingle()); },
    // Valida el token con Supabase Auth y agrega su nivel de verificación (aal1 = solo contraseña, aal2 = con código de la app).
    async usuarioDeToken(token) {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return null;
      let aal = "aal1";
      try { aal = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal || "aal1"; } catch {}
      return { ...data.user, aal };
    }
  };
}
