import { leerAjustes, errorWeb } from "./funciones.js";
import { registrar } from "./metricas.js";
// Documentos de la web: solo para una cita vigente de la propia conversación.
import { randomUUID } from "node:crypto";
import { huellaIp } from "./huella.js";
import { validarArchivo, limpiarDescripcion, limpiarNombre, ERROR_DESCRIPCION } from "./archivos.js";
import { AVISO_PRIVACIDAD } from "./privacidad.js";
import { registrarConsentimiento } from "./consentimiento.js";
import { notariaDe } from "./notaria.js";

const HORA = 3600 * 1000;
const LIMITES = { porSesion: 20, porIp: 40, consultasPorIp: 120 };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const SIN_CITA = "No encuentro una cita vigente con ese ticket. Si la cambiaste, usa la tarjeta más reciente.";
const sesionValida = (sesion) => typeof sesion === "string" && /^[A-Za-z0-9_-]{12,64}$/.test(sesion);
const lista = (documentos) => documentos.map(({ descripcion, estado, nombre }) => ({ descripcion, estado, nombre }));

export function crearManejadorDocumentos({ almacen, ahora = () => Date.now(), limites = LIMITES, avisar = async () => {} }) {
  async function buscarCita(sesion, ticket, t) {
    const conv = await almacen.conversacionPorTelefono("web:" + sesion);
    if (!conv) return null;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
    // El ticket es único por día, no global: si dos citas vigentes de la misma persona lo comparten, se usa la más próxima.
    const cita = (await almacen.solicitudesCita(conv.id))
      .filter((c) => typeof ticket === "string" && /^\d{4}$/.test(ticket) && c.codigo === ticket && ["pendiente", "confirmada"].includes(c.estado) && c.fecha >= hoy)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    return cita ? { conv, cita } : null;
  }

  return {
    async POST(request) {
      const ajustes = await leerAjustes(almacen), apagada = errorWeb(ajustes, "documentos");
      if (apagada) return json(apagada, 503);
      let b;
      try { b = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
      if (!sesionValida(b?.sesion)) return json({ error: "Sesión inválida" }, 400);
      if (b.aceptaTerminos !== true) return json({ error: "Acepta los términos y condiciones para enviar documentos." }, 400);
      if (b.aceptaDatos !== true) return json({ error: "Autoriza el tratamiento de tus datos para enviar documentos." }, 400);
      const descripcion = limpiarDescripcion(b.descripcion);
      if (!descripcion) return json({ error: ERROR_DESCRIPCION }, 400);
      const nombre = limpiarNombre(b.nombre);

      // Misma huella que el chat; la IP nunca se guarda en claro.
      const huella = huellaIp(request);
      const t = ahora();
      const [nSesion, nIp] = await Promise.all([
        almacen.contarUso("documentos:sesion:" + b.sesion, HORA, t),
        almacen.contarUso("documentos:ip:" + huella, HORA, t)
      ]);
      if (nSesion > limites.porSesion || nIp > limites.porIp) return json({ error: "Has enviado muchos documentos. Inténtalo de nuevo en una hora." }, 429);
      const encontrada = await buscarCita(b.sesion, b.ticket, t);
      if (!encontrada) return json({ error: SIN_CITA }, 404);
      const { conv, cita } = encontrada;

      const archivo = validarArchivo(b.base64);
      if (archivo.error) return json({ error: archivo.error }, archivo.status);
      const { bytes, tipo } = archivo;
      if ((await almacen.documentos(conv.id)).length >= 20) return json({ error: "Ya tienes 20 documentos en esta conversación." }, 409);
      await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "web-" + randomUUID(), nombre, mime: tipo, bytes, descripcion, tramiteId: cita.tramiteId, solicitudId: cita.id });
      await registrar(almacen, "doc.recibido.web", 1, t);
      // La línea de tiempo del portal es un extra: si falla, el documento ya quedó guardado y la subida sigue.
      try {
        await almacen.registrarEventoTramite({ notariaId: notariaDe(request), solicitudId: cita.id, tipo: "documento_recibido",
          textoCliente: "Recibimos tu documento: el personal lo revisará.", actor: "cliente" });
      } catch (e) { console.error("No se pudo registrar el evento del documento:", e?.message || e); }
      if (!conv.consentimiento) await almacen.actualizarConversacion(conv.id, {
        consentimiento: true, consentimientoEn: new Date(t).toISOString(),
        consentimientoTexto: `Casillas de la web: términos y tratamiento de datos (ticket ${b.ticket})`, consentimientoAviso: AVISO_PRIVACIDAD
      });
      await registrarConsentimiento(almacen, { canal: "documentos", titular: conv.telefono, texto: `Casillas al enviar un documento (ticket ${b.ticket})`, t: new Date(t) });
      await avisar(`Documento recibido en la web (ticket ${b.ticket}, ${cita.nombre || conv.nombre || ""}): ${descripcion}. Revísalo en el panel.`);
      return json({ ok: true, documentos: lista(await almacen.documentos(conv.id)) });
    },
    async GET(request) {
      const parametros = new URL(request.url).searchParams;
      // La sesión es la credencial de la conversación: llega en una cabecera, no en la URL (la URL queda en los registros de acceso).
      const sesion = request.headers.get("x-sesion"), ticket = parametros.get("ticket");
      if (!sesionValida(sesion)) return json({ error: "Sesión inválida" }, 400);
      // La consulta también tiene tope por IP: así no sirve para probar tickets.
      const t = ahora(), huella = huellaIp(request);
      if ((await almacen.contarUso("documentos:consulta:" + huella, HORA, t)) > limites.consultasPorIp) return json({ error: "Hiciste muchas consultas. Inténtalo de nuevo en una hora." }, 429);
      const encontrada = await buscarCita(sesion, ticket, t);
      if (!encontrada) return json({ error: SIN_CITA }, 404);
      return json({ documentos: lista(await almacen.documentos(encontrada.conv.id)) });
    }
  };
}
