// Adaptador de la API de WhatsApp Cloud (Meta): firma del webhook, lectura de mensajes y envío.
import { createHmac, timingSafeEqual } from "node:crypto";

// Meta firma cada webhook con HMAC-SHA256 del cuerpo crudo usando el secreto de la app.
export function verificarFirma(cuerpoCrudo, cabecera, secreto) {
  if (!cabecera || !secreto) return false;
  const esperada = Buffer.from("sha256=" + createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex"));
  const recibida = Buffer.from(String(cabecera));
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// Mensajes entrantes de un webhook, normalizados. Ignora avisos de estado (enviado, leído).
// tipo: "texto" | "archivo" (foto o documento) | "otro" (stickers, ubicación, audio…).
export function extraerMensajes(body) {
  const salida = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const nombres = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const m of v.messages || []) {
        if (m.type === "reaction") continue;
        const base = { id: m.id, de: m.from, nombre: nombres[m.from] || "" };
        const texto = m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text
          : m.type === "interactive" ? m.interactive?.button_reply?.title || m.interactive?.list_reply?.title : null;
        if (texto != null) salida.push({ ...base, ...(texto.trim() ? { tipo: "texto", texto } : { tipo: "otro", texto: "" }) });
        else if (m.type === "document" || m.type === "image") {
          const d = m[m.type];
          const media = { id: d.id, mime: d.mime_type };
          if (d.filename) media.nombre = d.filename;
          salida.push({ ...base, tipo: "archivo", texto: d.caption || "", media });
        } else salida.push({ ...base, tipo: "otro", texto: "" });
        salida.at(-1).timestamp = m.timestamp;
      }
    }
  }
  return salida;
}

// Cliente de envío. fetch se inyecta para poder probarlo.
export function crearWhatsApp({ token, phoneNumberId, version = "v23.0", fetch = globalThis.fetch }) {
  const graph = `https://graph.facebook.com/${version}`;
  const auth = { Authorization: `Bearer ${token}` };

  async function llamar(url, init) {
    const r = await fetch(url, init);
    if (!r.ok) {
      let detalle = "";
      try { detalle = (await r.json())?.error?.message || ""; } catch {}
      throw new Error(`WhatsApp API ${r.status}: ${detalle}`);
    }
    return r;
  }
  const enviar = (cuerpo) => llamar(`${graph}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo })
  }).then((r) => r.json());

  return {
    enviarTexto: (para, texto) => enviar({ to: para, type: "text", text: { body: texto, preview_url: false } }),

    // Mensajes iniciados por la notaría (fuera de la ventana de 24 h) solo con plantillas aprobadas por Meta.
    enviarPlantilla: (para, nombre, parametros = [], idioma = "es") => enviar({
      to: para, type: "template",
      template: { name: nombre, language: { code: idioma }, components: [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t).replace(/\s+/g, " ").trim() })) }] }
    }),

    // Marca el mensaje como leído y muestra "escribiendo…" mientras el asistente responde.
    marcarLeido: (mensajeId) => enviar({ status: "read", message_id: mensajeId, typing_indicator: { type: "text" } }),

    async descargarArchivo(mediaId) {
      const info = await (await llamar(`${graph}/${mediaId}`, { headers: auth })).json();
      const archivo = await llamar(info.url, { headers: auth });
      return { bytes: new Uint8Array(await archivo.arrayBuffer()), mime: info.mime_type };
    }
  };
}
