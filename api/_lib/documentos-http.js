// Documentos de la web: solo para una cita vigente de la propia conversación.
import { createHash, randomUUID } from "node:crypto";
import { tipoArchivo } from "./archivos.js";
import { AVISO_PRIVACIDAD } from "./privacidad.js";

// Vercel rechaza pedidos de más de 4,5 MB: 3 MB de archivo son 4 MB en base64, que caben con el resto del JSON.
const HORA = 3600 * 1000, MAX_BYTES = 3 * 1024 * 1024;
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
      let b;
      try { b = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
      if (!sesionValida(b?.sesion)) return json({ error: "Sesión inválida" }, 400);
      if (b.aceptaAviso !== true) return json({ error: "Acepta el aviso de privacidad para enviar documentos." }, 400);
      // Una sola línea y sin caracteres de control: la descripción llega tal cual al aviso del personal.
      const descripcion = typeof b.descripcion === "string" ? b.descripcion.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim() : "";
      if (descripcion.length < 2 || descripcion.length > 120) return json({ error: "Describe el documento con entre 2 y 120 caracteres." }, 400);
      const nombre = (typeof b.nombre === "string" ? b.nombre : "").replace(/[^\w. -]/g, "").slice(0, 120);

      // Misma huella que el chat; la IP nunca se guarda en claro.
      const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconocida";
      const huella = createHash("sha256").update("notaria41:" + ip).digest("hex").slice(0, 24);
      const t = ahora();
      const [nSesion, nIp] = await Promise.all([
        almacen.contarUso("documentos:sesion:" + b.sesion, HORA, t),
        almacen.contarUso("documentos:ip:" + huella, HORA, t)
      ]);
      if (nSesion > limites.porSesion || nIp > limites.porIp) return json({ error: "Has enviado muchos documentos. Inténtalo de nuevo en una hora." }, 429);
      const encontrada = await buscarCita(b.sesion, b.ticket, t);
      if (!encontrada) return json({ error: SIN_CITA }, 404);
      const { conv, cita } = encontrada;

      // Buffer.from es permisivo: revisa el alfabeto y el relleno antes de decodificar.
      if (typeof b.base64 !== "string" || !b.base64 || (b.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))) return json({ error: "El archivo no contiene base64 válido." }, 400);
      const bytes = Buffer.from(b.base64, "base64");
      if (bytes.toString("base64") !== b.base64) return json({ error: "El archivo no contiene base64 válido." }, 400);
      if (bytes.length > MAX_BYTES) return json({ error: "El archivo pesa más de 3 MB. Reduce su tamaño e inténtalo de nuevo." }, 413);
      const tipo = tipoArchivo(bytes);
      if (!tipo) return json({ error: "Envía un archivo PDF, JPG, PNG o WEBP." }, 415);
      if ((await almacen.documentos(conv.id)).length >= 20) return json({ error: "Ya tienes 20 documentos en esta conversación." }, 409);
      await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "web-" + randomUUID(), nombre, mime: tipo, bytes, descripcion, tramiteId: cita.tramiteId });
      if (!conv.consentimiento) await almacen.actualizarConversacion(conv.id, {
        consentimiento: true, consentimientoEn: new Date(t).toISOString(),
        consentimientoTexto: `Casilla del aviso de privacidad en la web (ticket ${b.ticket})`, consentimientoAviso: AVISO_PRIVACIDAD
      });
      await avisar(`Documento recibido en la web (ticket ${b.ticket}, ${cita.nombre || conv.nombre || ""}): ${descripcion}. Revísalo en el panel.`);
      return json({ ok: true, documentos: lista(await almacen.documentos(conv.id)) });
    },
    async GET(request) {
      const parametros = new URL(request.url).searchParams;
      // La sesión es la credencial de la conversación: llega en una cabecera, no en la URL (la URL queda en los registros de acceso).
      const sesion = request.headers.get("x-sesion"), ticket = parametros.get("ticket");
      if (!sesionValida(sesion)) return json({ error: "Sesión inválida" }, 400);
      // La consulta también tiene tope por IP: así no sirve para probar tickets.
      const t = ahora(), ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconocida";
      const huella = createHash("sha256").update("notaria41:" + ip).digest("hex").slice(0, 24);
      if ((await almacen.contarUso("documentos:consulta:" + huella, HORA, t)) > limites.consultasPorIp) return json({ error: "Hiciste muchas consultas. Inténtalo de nuevo en una hora." }, 429);
      const encontrada = await buscarCita(sesion, ticket, t);
      if (!encontrada) return json({ error: SIN_CITA }, 404);
      return json({ documentos: lista(await almacen.documentos(encontrada.conv.id)) });
    }
  };
}
