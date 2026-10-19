// Almacén del portal de clientes sobre Supabase. Misma interfaz que portal-memoria.js.
// Corre con la clave service_role (se salta RLS): por eso cada método exige notariaId y filtra por cliente.
import { exigirNotaria } from "./notaria.js";

const DIA = 864e5;
const CAMPOS_CLIENTE = { nombres: "nombres", apellidos: "apellidos", celular: "celular", avisosCorreo: "avisos_correo", avisosWhatsapp: "avisos_whatsapp",
  privacidadVersion: "privacidad_version", terminosVersion: "terminos_version", privacidadAceptadaEn: "privacidad_aceptada_en",
  ultimoAcceso: "ultimo_acceso", estado: "estado" };

const cliente = (r) => r && { id: r.id, notariaId: r.notaria_id, email: r.email, emailVerificadoEn: r.email_verificado_en, nombres: r.nombres,
  apellidos: r.apellidos, celular: r.celular, avisosCorreo: r.avisos_correo, avisosWhatsapp: r.avisos_whatsapp, privacidadVersion: r.privacidad_version,
  terminosVersion: r.terminos_version, privacidadAceptadaEn: r.privacidad_aceptada_en, estado: r.estado, creado: r.creado, ultimoAcceso: r.ultimo_acceso };
const sesion = (r) => r && { id: r.id, notariaId: r.notaria_id, clienteId: r.cliente_id, tokenHash: r.token_hash, creada: r.creada,
  ultimaActividad: r.ultima_actividad, expiraEn: r.expira_en, revocadaEn: r.revocada_en };
const pago = (r) => r && { id: r.id, notariaId: r.notaria_id, solicitudId: r.solicitud_id, clienteId: r.cliente_id, ticketSnapshot: r.ticket_snapshot,
  concepto: r.concepto, montoCentavos: r.monto_centavos, moneda: r.moneda, estado: r.estado, proveedor: r.proveedor, ordenProveedor: r.orden_proveedor,
  idempotencia: r.idempotencia, creado: r.creado, actualizado: r.actualizado, pagadoEn: r.pagado_en };
const docPublico = (d) => ({ descripcion: d.descripcion || "", nombre: d.nombre || "", estado: d.estado || "recibido", observacion: d.observacion_cliente || "",
  creado: Date.parse(d.creado) });
const pagoPublico = (p) => ({ id: p.id, estado: p.estado, concepto: p.concepto, montoCentavos: p.monto_centavos, moneda: p.moneda, pagadoEn: p.pagado_en || null });
const tramite = (c) => ({ id: c.id, notariaId: c.notaria_id, conversacionId: c.conversacion_id, codigo: c.codigo ?? null, tramiteId: c.tramite_id,
  fecha: c.fecha, hora: c.hora, nombre: c.nombre, estado: c.estado, motivo: c.motivo, clienteId: c.cliente_id });

export function crearPortalSupabase(db, ok) {
  const ahoraIso = () => new Date().toISOString();
  // Documentos y pagos de varios trámites en dos consultas.
  async function completar(filas) {
    if (!filas.length) return [];
    const convs = [...new Set(filas.map((c) => c.conversacion_id))], ids = filas.map((c) => c.id);
    const [docs, pagos] = await Promise.all([
      db.from("documentos").select("conversacion_id, solicitud_id, descripcion, nombre, estado, observacion_cliente, creado").in("conversacion_id", convs).is("borrado_en", null).order("creado"),
      db.from("pagos").select("id, solicitud_id, estado, concepto, monto_centavos, moneda, pagado_en").in("solicitud_id", ids)
    ]);
    const d = ok(docs), p = ok(pagos);
    return filas.map((c) => ({ ...tramite(c),
      documentos: d.filter((x) => x.solicitud_id === c.id || (!x.solicitud_id && x.conversacion_id === c.conversacion_id)).map(docPublico),
      pagos: p.filter((x) => x.solicitud_id === c.id).map(pagoPublico) }));
  }

  return {
    // --- Códigos de un solo uso ---
    async crearCodigoCliente({ notariaId, destinoHuella, codigoHmac, expiraEn, ipHuella = "" }) {
      exigirNotaria(notariaId);
      ok(await db.from("cliente_codigos").update({ usado_en: ahoraIso() }).eq("notaria_id", notariaId).eq("destino_huella", destinoHuella).is("usado_en", null));
      const r = ok(await db.from("cliente_codigos").insert({ notaria_id: notariaId, destino_huella: destinoHuella, codigo_hmac: codigoHmac, expira_en: expiraEn, ip_huella: ipHuella }).select("id").single());
      return { id: r.id };
    },
    async ultimoCodigoCliente({ notariaId, destinoHuella }) {
      exigirNotaria(notariaId);
      const r = ok(await db.from("cliente_codigos").select("creado").eq("notaria_id", notariaId).eq("destino_huella", destinoHuella).order("creado", { ascending: false }).limit(1).maybeSingle());
      return r ? { creado: r.creado } : null;
    },
    // Atómico en la base (función consumir_codigo_cliente): acierto, fallo con intento sumado o código anulado.
    async consumirCodigoCliente({ notariaId, destinoHuella, codigoHmac }) {
      exigirNotaria(notariaId);
      return ok(await db.rpc("consumir_codigo_cliente", { p_notaria: notariaId, p_destino: destinoHuella, p_hmac: codigoHmac })) === true;
    },

    // --- Clientes ---
    async clientePorEmail(notariaId, email) {
      exigirNotaria(notariaId);
      return cliente(ok(await db.from("clientes").select("*").eq("notaria_id", notariaId).eq("email", String(email).toLowerCase()).maybeSingle()));
    },
    async clientePorId(notariaId, id) {
      exigirNotaria(notariaId);
      return cliente(ok(await db.from("clientes").select("*").eq("notaria_id", notariaId).eq("id", id).maybeSingle()));
    },
    async crearCliente({ notariaId, email, emailVerificadoEn }) {
      exigirNotaria(notariaId);
      return cliente(ok(await db.from("clientes").insert({ notaria_id: notariaId, email: String(email).toLowerCase(), email_verificado_en: emailVerificadoEn }).select("*").single()));
    },
    async actualizarCliente(notariaId, id, cambios) {
      exigirNotaria(notariaId);
      const fila = {};
      for (const [k, col] of Object.entries(CAMPOS_CLIENTE)) if (k in cambios) fila[col] = cambios[k];
      if (Object.keys(fila).length) ok(await db.from("clientes").update(fila).eq("notaria_id", notariaId).eq("id", id));
    },

    // --- Sesiones ---
    async crearSesionCliente({ notariaId, clienteId, tokenHash, expiraEn }) {
      exigirNotaria(notariaId);
      const r = ok(await db.from("cliente_sesiones").insert({ notaria_id: notariaId, cliente_id: clienteId, token_hash: tokenHash, expira_en: expiraEn }).select("id").single());
      return { id: r.id };
    },
    async sesionCliente(tokenHash) { return sesion(ok(await db.from("cliente_sesiones").select("*").eq("token_hash", tokenHash).maybeSingle())); },
    async tocarSesionCliente(id, cuando = ahoraIso()) { ok(await db.from("cliente_sesiones").update({ ultima_actividad: cuando }).eq("id", id)); },
    async revocarSesionCliente(tokenHash) { ok(await db.from("cliente_sesiones").update({ revocada_en: ahoraIso() }).eq("token_hash", tokenHash).is("revocada_en", null)); },
    async revocarSesionesCliente(notariaId, clienteId) {
      exigirNotaria(notariaId);
      ok(await db.from("cliente_sesiones").update({ revocada_en: ahoraIso() }).eq("notaria_id", notariaId).eq("cliente_id", clienteId).is("revocada_en", null));
    },

    // --- Vinculación de trámites ---
    async crearVinculacion({ notariaId, solicitudId, tokenHash, canal, expiraEn, creadoPor = "sistema" }) {
      exigirNotaria(notariaId);
      ok(await db.from("tramite_vinculaciones").insert({ notaria_id: notariaId, solicitud_id: solicitudId, token_hash: tokenHash, canal, expira_en: expiraEn, creado_por: creadoPor }));
    },
    // Atómico en la base (función consumir_vinculacion): un solo uso y nunca quita un trámite a otro cliente.
    async consumirVinculacion({ notariaId, tokenHash, clienteId }) {
      exigirNotaria(notariaId);
      return ok(await db.rpc("consumir_vinculacion", { p_notaria: notariaId, p_token_hash: tokenHash, p_cliente: clienteId })) || null;
    },
    async desvincularTramite(notariaId, solicitudId) {
      exigirNotaria(notariaId);
      ok(await db.from("solicitudes_cita").update({ cliente_id: null }).eq("notaria_id", notariaId).eq("id", solicitudId));
    },

    // --- Trámites del cliente ---
    async tramitesDeCliente(notariaId, clienteId) {
      exigirNotaria(notariaId);
      return completar(ok(await db.from("solicitudes_cita").select("*").eq("notaria_id", notariaId).eq("cliente_id", clienteId).order("fecha", { ascending: false })));
    },
    async tramiteDeCliente(notariaId, clienteId, id) {
      exigirNotaria(notariaId);
      const fila = ok(await db.from("solicitudes_cita").select("*").eq("notaria_id", notariaId).eq("cliente_id", clienteId).eq("id", id).maybeSingle());
      if (!fila) return null;
      const [t] = await completar([fila]);
      const eventos = ok(await db.from("tramite_eventos").select("tipo, texto_cliente, actor, creado").eq("solicitud_id", id).eq("visible_cliente", true).order("creado"));
      return { ...t, eventos: eventos.map((e) => ({ tipo: e.tipo, texto: e.texto_cliente, actor: e.actor, creado: e.creado })) };
    },
    async registrarEventoTramite({ notariaId, solicitudId, tipo, visibleCliente = true, textoCliente = "", actor = "sistema" }) {
      exigirNotaria(notariaId);
      ok(await db.from("tramite_eventos").insert({ notaria_id: notariaId, solicitud_id: solicitudId, tipo, visible_cliente: visibleCliente, texto_cliente: textoCliente, actor }));
    },

    // --- Panel ---
    async clientesPanel(notariaId, { ticket, texto, email } = {}) {
      exigirNotaria(notariaId);
      let q = db.from("clientes").select("id, email, nombres, apellidos, estado, creado, ultimo_acceso, solicitudes_cita(count)").eq("notaria_id", notariaId).limit(50);
      if (email) q = q.eq("email", String(email).toLowerCase());
      else if (texto) { const t = String(texto).replace(/[%_,()]/g, " ").trim(); q = q.or(`nombres.ilike.%${t}%,apellidos.ilike.%${t}%`); }
      else if (ticket) {
        const ids = ok(await db.from("solicitudes_cita").select("cliente_id").eq("notaria_id", notariaId).eq("codigo", ticket).not("cliente_id", "is", null)).map((r) => r.cliente_id);
        if (!ids.length) return [];
        q = q.in("id", ids);
      } else return [];
      return ok(await q).map((c) => ({ id: c.id, email: c.email, nombres: c.nombres, apellidos: c.apellidos, estado: c.estado, creado: c.creado,
        ultimoAcceso: c.ultimo_acceso, tramites: c.solicitudes_cita?.[0]?.count ?? 0 }));
    },

    // --- Pagos del ciudadano (caso A) ---
    async crearPago(p) {
      exigirNotaria(p.notariaId);
      const previo = ok(await db.from("pagos").select("*").eq("notaria_id", p.notariaId).eq("idempotencia", p.idempotencia).maybeSingle());
      if (previo) return { ...pago(previo), existente: true };
      const insercion = await db.from("pagos").insert({ notaria_id: p.notariaId, solicitud_id: p.solicitudId || null, cliente_id: p.clienteId || null,
        ticket_snapshot: p.ticketSnapshot || "", concepto: p.concepto, monto_centavos: p.montoCentavos, moneda: p.moneda || "USD",
        proveedor: p.proveedor, idempotencia: p.idempotencia }).select("*").single();
      if (insercion.error) throw Object.assign(new Error(`Supabase: ${insercion.error.message}`), { code: insercion.error.code });
      return pago(insercion.data);
    },
    async pagoPorId(notariaId, id) { exigirNotaria(notariaId); return pago(ok(await db.from("pagos").select("*").eq("notaria_id", notariaId).eq("id", id).maybeSingle())); },
    async pagoActivoPorSolicitud(notariaId, solicitudId) {
      exigirNotaria(notariaId);
      return pago(ok(await db.from("pagos").select("*").eq("notaria_id", notariaId).eq("solicitud_id", solicitudId)
        .in("estado", ["creado", "pendiente", "procesando"]).maybeSingle()));
    },
    async pagoPorOrden(proveedor, orden) { return pago(ok(await db.from("pagos").select("*").eq("proveedor", proveedor).eq("orden_proveedor", orden).maybeSingle())); },
    async fijarOrdenPago(id, orden) { ok(await db.from("pagos").update({ orden_proveedor: orden, actualizado: ahoraIso() }).eq("id", id)); },
    async transicionarPago(id, de, a, { pagadoEn = null } = {}) {
      const fila = { estado: a, actualizado: ahoraIso(), ...(pagadoEn ? { pagado_en: pagadoEn } : {}) };
      return ok(await db.from("pagos").update(fila).eq("id", id).eq("estado", de).select("id")).length === 1;
    },
    async registrarEventoPago(e) {
      const { error } = await db.from("pago_eventos").insert({ pago_id: e.pagoId || null, proveedor: e.proveedor, evento_proveedor_id: e.eventoProveedorId,
        tipo: e.tipo || "", estado_anterior: e.estadoAnterior ?? null, estado_nuevo: e.estadoNuevo ?? null, monto_centavos: e.montoCentavos ?? null,
        moneda: e.moneda ?? null, firma_valida: e.firmaValida, resultado: e.resultado, carga_huella: e.cargaHuella || "" });
      if (error?.code === "23505") return { duplicado: true };
      if (error) throw new Error(error.message);
      return { duplicado: false };
    },

    // --- Retención: códigos 1 día, sesiones y vínculos terminados 30 días, cuentas sin uso 24 meses ---
    async purgarPortal({ ahora = Date.now() } = {}) {
      const hace = (dias) => new Date(ahora - dias * DIA).toISOString();
      ok(await db.from("cliente_codigos").delete().lt("creado", hace(1)));
      ok(await db.from("cliente_sesiones").delete().lt("expira_en", hace(30)));
      ok(await db.from("cliente_sesiones").delete().lt("revocada_en", hace(30)));
      ok(await db.from("tramite_vinculaciones").delete().lt("expira_en", hace(30)));
      ok(await db.from("tramite_vinculaciones").delete().lt("usado_en", hace(30)));
      const viejos = ok(await db.from("clientes").delete().lt("ultimo_acceso", hace(730)).select("id"));
      return { clientes: viejos.length };
    }
  };
}
