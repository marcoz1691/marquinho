// Documentos de la web: solo para una cita vigente de la propia conversación.
import { createHash, randomUUID } from "node:crypto";
import { tipoArchivo } from "./archivos.js";

const HORA = 3600 * 1000, MAX_BYTES = 4 * 1024 * 1024;
const LIMITES = { porSesion: 20, porIp: 40 };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sesionValida = (sesion) => typeof sesion === "string" && /^[A-Za-z0-9_-]{12,64}$/.test(sesion);
const lista = (documentos) => documentos.map(({ descripcion, estado, nombre }) => ({ descripcion, estado, nombre }));

export function crearManejadorDocumentos({ almacen, ahora = () => Date.now(), limites = LIMITES, avisar = async () => {} }) {
  async function buscarCita(sesion, ticket, t) {
    // conversacion() crea si no existe: comprueba primero sin escribir en el almacén.
    const existe = (await almacen.conversaciones()).some((c) => c.telefono === "web:" + sesion);
    if (!existe) return null;
    const conv = await almacen.conversacion("web:" + sesion);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
    const cita = (await almacen.solicitudesCita(conv.id)).find((c) => typeof ticket === "string" && /^\d{4}$/.test(ticket) && c.codigo === ticket && ["pendiente", "confirmada"].includes(c.estado) && c.fecha >= hoy);
    return cita ? { conv, cita } : null;
  }

  return {
    async POST(request) {
      let b;
      try { b = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
      if (!sesionValida(b?.sesion)) return json({ error: "Sesión inválida" }, 400);
      if (b.aceptaAviso !== true) return json({ error: "Acepta el aviso de privacidad para enviar documentos." }, 400);
      const descripcion = typeof b.descripcion === "string" ? b.descripcion.trim() : "";
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
      if (!encontrada) return json({ error: "No encuentro tu cita" }, 404);
      const { conv, cita } = encontrada;

      // Buffer.from es permisivo: revisa el alfabeto y el relleno antes de decodificar.
      if (typeof b.base64 !== "string" || !b.base64 || (b.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))) return json({ error: "El archivo no contiene base64 válido." }, 400);
      const bytes = Buffer.from(b.base64, "base64");
      if (bytes.toString("base64") !== b.base64) return json({ error: "El archivo no contiene base64 válido." }, 400);
      if (bytes.length > MAX_BYTES) return json({ error: "El archivo pesa más de 4 MB. Reduce su tamaño e inténtalo de nuevo." }, 413);
      const tipo = tipoArchivo(bytes);
      if (!tipo) return json({ error: "Envía un archivo PDF, JPG, PNG o WEBP." }, 415);
      if ((await almacen.documentos(conv.id)).length >= 20) return json({ error: "Ya tienes 20 documentos en esta conversación." }, 409);
      await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "web-" + randomUUID(), nombre, mime: tipo, bytes, descripcion, tramiteId: cita.tramiteId });
      if (!conv.consentimiento) await almacen.actualizarConversacion(conv.id, {
        consentimiento: true, consentimientoEn: new Date(t).toISOString(),
        consentimientoTexto: `Casilla del aviso de privacidad en la web (ticket ${b.ticket})`, consentimientoAviso: "2026-10-07"
      });
      await avisar(`Documento recibido en la web (ticket ${b.ticket}, ${cita.nombre || conv.nombre || ""}): ${descripcion}. Revísalo en el panel.`);
      return json({ ok: true, documentos: lista(await almacen.documentos(conv.id)) });
    },
    async GET(request) {
      const parametros = new URL(request.url).searchParams;
      const sesion = parametros.get("sesion"), ticket = parametros.get("ticket");
      if (!sesionValida(sesion)) return json({ error: "Sesión inválida" }, 400);
      const encontrada = await buscarCita(sesion, ticket, ahora());
      if (!encontrada) return json({ error: "No encuentro tu cita" }, 404);
      return json({ documentos: lista(await almacen.documentos(encontrada.conv.id)) });
    }
  };
}
