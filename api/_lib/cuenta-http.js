// API de la cuenta del cliente («Mis trámites», Sofía PreFirma; docs/adr/0004): entrar con un código por correo, perfil,
// preferencias, trámites guardados, documentos y vinculación. La notaría la decide el servidor; nunca el navegador.
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { leerAjustes, errorWeb } from "./funciones.js";
import { abrirSesion, leerSesion, mismoOrigen, cookieCerrada } from "./sesion-cliente.js";
import { consumirVinculo } from "./vinculos.js";
import { notariaDe } from "./notaria.js";
import { huellaIp } from "./huella.js";
import { registrarConsentimiento } from "./consentimiento.js";
import { AVISO_PRIVACIDAD, TERMINOS } from "./privacidad.js";
import { validarArchivo, limpiarDescripcion, limpiarNombre, ERROR_DESCRIPCION } from "./archivos.js";
import { celular, fechaQuito } from "./citas.js";
import { correoCodigo } from "./correos-cliente.js";
import { precioTexto } from "../../js/nucleo.js";

const MINUTO = 60e3, HORA = 60 * MINUTO, DIA = 24 * HORA;
const VIGENCIA_CODIGO = 10 * MINUTO, ESPERA_REENVIO = MINUTO;
const LIMITES = { codigoPorCorreo: 5, codigoPorIp: 20, codigoPorDia: 300, verificarPorIp: 10, docsPorCliente: 20, vincularPorCliente: 10, vincularPorIp: 20 };
// Vercel corta los pedidos de 4,5 MB; solo subirDocumento trae un archivo. El resto cabe de sobra en 8 KB.
const MAX_CUERPO = 4_500_000, MAX_CUERPO_CORTO = 8192;

const ENVIADO = "Si el correo es válido, te enviamos un código. Revisa tu bandeja y la carpeta de spam.";
const NO_DISPONIBLE = "Las cuentas no están disponibles por ahora.";
const MUCHOS = "Hiciste muchos intentos. Inténtalo de nuevo en una hora.";
const CODIGO_MAL = "Código incorrecto o vencido.";
const SIN_SESION = "Inicia sesión para continuar.";
const SIN_TRAMITE = "No encontramos ese trámite.";
const VINCULO_MAL = "Este enlace ya no es válido. Pide uno nuevo a la notaría.";
const CELULAR_MAL = "Escribe un celular válido de Ecuador, por ejemplo 0991234567.";
const ADVERTENCIAS = ["Valor referencial más IVA; no incluye documentos habilitantes.", "El valor final lo confirma la notaría."];
const AVISO_NOTARIAL = "El acto se celebra ante el notario, en la notaría.";

const ESTADO_CITA = { pendiente: "Tu cita está pendiente de confirmación", confirmada: "Cita confirmada", atendida: "Atendida", rechazada: "No se pudo confirmar" };
const ESTADO_DOC = { recibido: "Recibido: el personal lo revisará", aprobado: "Revisado por el personal", observado: "Por corregir" };
const VIGENTES = ["pendiente", "confirmada"];

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const iso = (ms) => new Date(ms).toISOString();
const normalizarCorreo = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const correoValido = (e) => e.length <= 254 && /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@.\u0000-\u001f\u007f]{2,}$/.test(e);
// Los trámites son uuid en Supabase; en memoria, números. Cualquier otra cosa no llega al almacén.
const idValido = (id) => typeof id === "string" && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{1,12})$/i.test(id);
const textoCorto = (v) => (typeof v === "string" && !/[\u0000-\u001f\u007f]/.test(v) && v.trim().length >= 1 && v.trim().length <= 80 ? v.trim().replace(/ +/g, " ") : null);
const celularValido = (v) => { const c = celular(v); return c && /^5939\d{8}$/.test(c) ? c : null; };
const perfilCompleto = (c) => !!(c.nombres && c.apellidos && c.privacidadVersion === AVISO_PRIVACIDAD && c.terminosVersion === TERMINOS);
// Lo único que ve el navegador del cliente: nunca estado interno, fechas de aceptación ni la notaría.
const publico = (c) => ({ id: c.id, email: c.email, nombres: c.nombres || "", apellidos: c.apellidos || "", celular: c.celular || null,
  avisosCorreo: !!c.avisosCorreo, avisosWhatsapp: !!c.avisosWhatsapp, perfilCompleto: perfilCompleto(c) });

// Resumen de un trámite para el cliente: estados en texto, sin la nota interna ni ids de conversación o documentos.
function resumir(t, C, hoy) {
  const docs = t.documentos || [];
  const observados = docs.filter((d) => d.estado === "observado").length, recibidos = docs.filter((d) => d.estado === "recibido").length;
  const activo = VIGENTES.includes(t.estado) && t.fecha >= hoy;
  const ficha = C?.data?.tramites?.find((x) => x.id === t.tramiteId);
  const pago = (t.pagos || []).at(-1);
  const estadoTexto = VIGENTES.includes(t.estado) && !activo ? "La fecha de tu cita ya pasó" : ESTADO_CITA[t.estado] || "En revisión";
  const siguientePaso = !activo
    ? (t.estado === "atendida" ? "Si necesitas algo más de este trámite, escríbenos por WhatsApp." : "Si aún lo necesitas, agenda una nueva cita o escríbenos por WhatsApp.")
    : observados ? "Documentos por corregir"
    : recibidos ? "El personal revisará lo que enviaste"
    : t.estado === "confirmada" ? "Lleva tu cédula y los documentos originales a tu cita" : "Te avisaremos cuando la notaría confirme tu cita";
  return {
    activo, ficha,
    item: { id: t.id, nombre: ficha?.nombre || "Trámite por definir", notaria: C?.notaria?.nombre || "", ticket: t.codigo ?? null, estado: t.estado,
      estadoTexto, siguientePaso, cita: { fecha: t.fecha, hora: t.hora || "", estado: t.estado }, documentosPendientes: observados,
      documentosEnviados: docs.length, pago: pago ? { estado: pago.estado, montoCentavos: pago.montoCentavos } : null }
  };
}

export function crearManejadorCuenta({ almacen, correo, contenido, ahora = () => Date.now(), secreto, limites = LIMITES }) {
  const hmac = (texto) => createHmac("sha256", secreto).update(texto).digest("hex");
  const destino = (notariaId, email) => hmac("destino|" + notariaId + "|" + email);
  const cargar = async () => { try { return await contenido(); } catch (e) { console.error("Contenido no disponible para la cuenta:", e?.message || e); return null; } };
  const excede = async (clave, ventana, tope, t) => (await almacen.contarUso(clave, ventana, t)) > tope;

  // Envuelve una acción que exige sesión: sin cookie válida para esta notaría responde 401.
  const conSesion = (accion) => async (request, b, t) => {
    const notariaId = notariaDe(request);
    const s = await leerSesion({ almacen, request, notariaId, ahora: t });
    if (!s) return json({ error: SIN_SESION }, 401);
    return accion({ request, b, t, notariaId, ...s });
  };

  async function pedirCodigo(request, b, t) {
    if (!correo || !secreto) return json({ error: NO_DISPONIBLE }, 503);
    const email = normalizarCorreo(b.email);
    if (!correoValido(email)) return json({ error: "Escribe un correo válido." }, 400);
    const notariaId = notariaDe(request), destinoHuella = destino(notariaId, email), ipHuella = huellaIp(request);
    if (await excede("cuenta:codigo-ip:" + ipHuella, HORA, limites.codigoPorIp, t)) return json({ error: MUCHOS }, 429);
    // Siempre la misma respuesta, exista o no la cuenta, y aunque se haya pasado del límite o esté en espera: no revela nada.
    const aceptado = () => json({ mensaje: ENVIADO }, 202);
    const [porCorreo, porDia] = await Promise.all([
      excede("cuenta:codigo:" + destinoHuella.slice(0, 32), HORA, limites.codigoPorCorreo, t),
      excede("cuenta:codigo-dia", DIA, limites.codigoPorDia, t)
    ]);
    if (porCorreo || porDia) return aceptado();
    const ultimo = await almacen.ultimoCodigoCliente({ notariaId, destinoHuella });
    if (ultimo && t - Date.parse(ultimo.creado) < ESPERA_REENVIO) return aceptado();
    const codigo = String(randomInt(0, 1e6)).padStart(6, "0");
    await almacen.crearCodigoCliente({ notariaId, destinoHuella, codigoHmac: hmac(notariaId + "|" + email + "|" + codigo), expiraEn: iso(t + VIGENCIA_CODIGO), ipHuella });
    try {
      const C = await cargar();
      await correo.enviar({ para: email, ...correoCodigo({ codigo, notaria: C?.notaria?.nombre }) });
    } catch (e) { console.error("No se pudo enviar el código de acceso:", e?.message || e); }
    return aceptado();
  }

  async function verificar(request, b, t) {
    if (!secreto) return json({ error: NO_DISPONIBLE }, 503);
    if (await excede("cuenta:verificar-ip:" + huellaIp(request), HORA, limites.verificarPorIp, t)) return json({ error: MUCHOS }, 429);
    // Un solo mensaje para todo fallo: código mal escrito, incorrecto, vencido, usado, anulado o cuenta bloqueada.
    const fallo = () => json({ error: CODIGO_MAL }, 400);
    const email = normalizarCorreo(b.email), codigo = typeof b.codigo === "string" ? b.codigo.replace(/\s/g, "") : "";
    if (!correoValido(email) || !/^\d{6}$/.test(codigo)) return fallo();
    const notariaId = notariaDe(request);
    const valido = await almacen.consumirCodigoCliente({ notariaId, destinoHuella: destino(notariaId, email), codigoHmac: hmac(notariaId + "|" + email + "|" + codigo), ahora: t });
    if (!valido) return fallo();
    let cliente = await almacen.clientePorEmail(notariaId, email);
    if (!cliente) {
      try { cliente = await almacen.crearCliente({ notariaId, email, emailVerificadoEn: iso(t) }); }
      catch (e) { if (e?.code !== "23505") throw e; cliente = await almacen.clientePorEmail(notariaId, email); }
    }
    if (!cliente || cliente.estado !== "activa") return fallo();
    await almacen.actualizarCliente(notariaId, cliente.id, { ultimoAcceso: iso(t) });
    const setCookie = await abrirSesion({ almacen, notariaId, clienteId: cliente.id, ahora: t });
    return json({ cliente: publico(cliente), perfilCompleto: perfilCompleto(cliente) }, 200, { "Set-Cookie": setCookie });
  }

  const completarPerfil = conSesion(async ({ b, t, notariaId, cliente }) => {
    const nombres = textoCorto(b.nombres), apellidos = textoCorto(b.apellidos);
    if (!nombres) return json({ error: "Escribe tus nombres (hasta 80 caracteres)." }, 400);
    if (!apellidos) return json({ error: "Escribe tus apellidos (hasta 80 caracteres)." }, 400);
    const cambios = { nombres, apellidos };
    if (b.celular !== undefined && b.celular !== null && b.celular !== "") {
      if (!(cambios.celular = celularValido(b.celular))) return json({ error: CELULAR_MAL }, 400);
    }
    // Dos casillas separadas (LOPDP, art. 8): una no reemplaza a la otra.
    if (b.aceptaTerminos !== true) return json({ error: "Acepta los términos y condiciones para usar tu cuenta." }, 400);
    if (b.aceptaPrivacidad !== true) return json({ error: "Autoriza el tratamiento de tus datos para usar tu cuenta." }, 400);
    await almacen.actualizarCliente(notariaId, cliente.id, { ...cambios, privacidadVersion: AVISO_PRIVACIDAD, terminosVersion: TERMINOS, privacidadAceptadaEn: iso(t) });
    await registrarConsentimiento(almacen, { canal: "portal", titular: "cliente:" + cliente.id,
      texto: "Casillas de la cuenta: acepto los términos y condiciones; autorizo el tratamiento de mis datos según el aviso de privacidad", t: new Date(t) });
    const actual = await almacen.clientePorId(notariaId, cliente.id);
    return json({ cliente: publico(actual), perfilCompleto: perfilCompleto(actual) });
  });

  const preferencias = conSesion(async ({ b, notariaId, cliente }) => {
    if (typeof b.avisosCorreo !== "boolean" || typeof b.avisosWhatsapp !== "boolean") return json({ error: "Elige si quieres avisos por correo y por WhatsApp." }, 400);
    let cel = cliente.celular || null;
    if (b.celular === "" || b.celular === null) cel = null;
    else if (b.celular !== undefined && !(cel = celularValido(b.celular))) return json({ error: CELULAR_MAL }, 400);
    if (b.avisosWhatsapp && !cel) return json({ error: "Agrega tu celular para recibir avisos por WhatsApp." }, 400);
    await almacen.actualizarCliente(notariaId, cliente.id, { avisosCorreo: b.avisosCorreo, avisosWhatsapp: b.avisosWhatsapp, celular: cel });
    return json({ cliente: publico(await almacen.clientePorId(notariaId, cliente.id)) });
  });

  // Cerrar sesión siempre borra la cookie, haya o no una sesión válida.
  async function salir(request, _b, t) {
    const s = await leerSesion({ almacen, request, notariaId: notariaDe(request), ahora: t });
    if (s) await almacen.revocarSesionCliente(s.tokenHash);
    return json({ ok: true }, 200, { "Set-Cookie": cookieCerrada() });
  }
  const salirTodo = conSesion(async ({ notariaId, cliente }) => {
    await almacen.revocarSesionesCliente(notariaId, cliente.id);
    return json({ ok: true }, 200, { "Set-Cookie": cookieCerrada() });
  });

  const subirDocumento = conSesion(async ({ request, b, t, notariaId, cliente }) => {
    const apagada = errorWeb(await leerAjustes(almacen), "documentos");
    if (apagada) return json(apagada, 503);
    if (!perfilCompleto(cliente)) return json({ error: "Completa tu perfil y acepta los términos para enviar documentos." }, 403);
    if (!idValido(b.id)) return json({ error: SIN_TRAMITE }, 404);
    const descripcion = limpiarDescripcion(b.descripcion);
    if (!descripcion) return json({ error: ERROR_DESCRIPCION }, 400);
    if (await excede("cuenta:docs:" + cliente.id, HORA, limites.docsPorCliente, t)) return json({ error: "Has enviado muchos documentos. Inténtalo de nuevo en una hora." }, 429);
    const tramite = await almacen.tramiteDeCliente(notariaId, cliente.id, b.id);
    if (!tramite) return json({ error: SIN_TRAMITE }, 404);
    if (!VIGENTES.includes(tramite.estado) || tramite.fecha < fechaQuito(new Date(t))) return json({ error: "Este trámite ya no recibe documentos. Escríbenos por WhatsApp si necesitas ayuda." }, 409);
    const archivo = validarArchivo(b.base64);
    if (archivo.error) return json({ error: archivo.error }, archivo.status);
    if ((tramite.documentos || []).length >= 20) return json({ error: "Este trámite ya tiene 20 documentos." }, 409);
    await almacen.guardarDocumento({ conversacionId: tramite.conversacionId, mediaId: "portal-" + randomUUID(), nombre: limpiarNombre(b.nombre),
      mime: archivo.tipo, bytes: archivo.bytes, descripcion, tramiteId: tramite.tramiteId, solicitudId: tramite.id });
    try {
      await almacen.registrarEventoTramite({ notariaId, solicitudId: tramite.id, tipo: "documento_recibido", textoCliente: "Recibimos tu documento: el personal lo revisará.", actor: "cliente" });
    } catch (e) { console.error("No se pudo registrar el evento del documento:", e?.message || e); }
    return json({ ok: true });
  });

  const vincular = conSesion(async ({ request, b, t, notariaId, cliente }) => {
    const [porCliente, porIp] = await Promise.all([
      excede("cuenta:vincular:" + cliente.id, HORA, limites.vincularPorCliente, t),
      excede("cuenta:vincular-ip:" + huellaIp(request), HORA, limites.vincularPorIp, t)
    ]);
    if (porCliente || porIp) return json({ error: MUCHOS }, 429);
    const id = await consumirVinculo({ almacen, notariaId, clienteId: cliente.id, token: b.token, ahora: t });
    return id ? json({ id }) : json({ error: VINCULO_MAL }, 400);
  });

  const yo = conSesion(async ({ cliente }) => json({ cliente: publico(cliente) }));

  const tramites = conSesion(async ({ request, t, notariaId, cliente }) => {
    const filtro = new URL(request.url).searchParams.get("filtro") || "activos";
    if (filtro !== "activos" && filtro !== "finalizados") return json({ error: "Filtro inválido." }, 400);
    const hoy = fechaQuito(new Date(t));
    const [lista, C] = await Promise.all([almacen.tramitesDeCliente(notariaId, cliente.id), cargar()]);
    const orden = (a, b) => (a.cita.fecha + a.cita.hora).localeCompare(b.cita.fecha + b.cita.hora);
    const items = lista.map((x) => resumir(x, C, hoy)).filter((r) => r.activo === (filtro === "activos")).map((r) => r.item)
      .sort((a, b) => (filtro === "activos" ? orden(a, b) : orden(b, a)));
    return json({ tramites: items });
  });

  const tramite = conSesion(async ({ request, t, notariaId, cliente }) => {
    const id = new URL(request.url).searchParams.get("id");
    // Lo ajeno responde igual que lo inexistente.
    const x = idValido(id) ? await almacen.tramiteDeCliente(notariaId, cliente.id, id) : null;
    if (!x) return json({ error: SIN_TRAMITE }, 404);
    const C = await cargar();
    const { item, ficha } = resumir(x, C, fechaQuito(new Date(t)));
    return json({ tramite: {
      ...item,
      eventos: (x.eventos || []).map((e) => ({ tipo: e.tipo, texto: e.texto || "", actor: e.actor || "", creado: e.creado })),
      requisitos: ficha?.req || [],
      pasos: ficha?.pasos || [],
      costoReferencial: ficha?.tarifa && C?.tarifas ? precioTexto(ficha, C.tarifas) : null,
      advertencias: ADVERTENCIAS,
      documentos: (x.documentos || []).map((d) => ({ descripcion: d.descripcion || "", nombre: d.nombre || "", estado: d.estado,
        estadoTexto: ESTADO_DOC[d.estado] || ESTADO_DOC.recibido, observacion: d.observacion || "" })),
      ayuda: { whatsapp: C?.notaria?.whatsapp || "", telefonos: C?.notaria?.telefonos || [] },
      avisoNotarial: AVISO_NOTARIAL
    } });
  });

  const POSTS = { pedirCodigo, verificar, completarPerfil, preferencias, salir, salirTodo, subirDocumento, vincular };
  const GETS = { yo, tramites, tramite };

  return {
    async GET(request) {
      const apagada = errorWeb(await leerAjustes(almacen), "portal");
      if (apagada) return json(apagada, 503);
      const accion = new URL(request.url).searchParams.get("accion");
      if (!Object.hasOwn(GETS, accion || "")) return json({ error: "Acción desconocida." }, 400);
      return GETS[accion](request, {}, ahora());
    },
    async POST(request) {
      const apagada = errorWeb(await leerAjustes(almacen), "portal");
      if (apagada) return json(apagada, 503);
      if (!mismoOrigen(request)) return json({ error: "Solicitud no permitida." }, 403);
      if (Number(request.headers.get("content-length") || 0) > MAX_CUERPO) return json({ error: "La solicitud es demasiado grande." }, 413);
      let crudo, b;
      try { crudo = await request.text(); b = JSON.parse(crudo); } catch { return json({ error: "Solicitud inválida" }, 400); }
      if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "Solicitud inválida" }, 400);
      if (crudo.length > (b.accion === "subirDocumento" ? MAX_CUERPO : MAX_CUERPO_CORTO)) return json({ error: "La solicitud es demasiado grande." }, 413);
      if (typeof b.accion !== "string" || !Object.hasOwn(POSTS, b.accion)) return json({ error: "Acción desconocida." }, 400);
      return POSTS[b.accion](request, b, ahora());
    }
  };
}
