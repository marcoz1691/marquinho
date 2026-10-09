// Manejador del webhook de WhatsApp: verificación (GET) y mensajes entrantes (POST).
import { verificarFirma, extraerMensajes } from "./whatsapp.js";

const DISCULPA = "Disculpa, tuve un problema para responderte. Inténtalo de nuevo en unos minutos o llama a la notaría.";

export function crearManejador({ asistente, whatsapp, secreto, tokenVerificacion, enSegundoPlano }) {
  async function procesar(m) {
    try {
      await whatsapp.marcarLeido(m.id).catch(() => {});
      for (const texto of await asistente.atender(m)) await whatsapp.enviarTexto(m.de, texto);
    } catch (e) {
      console.error("Error atendiendo", m.id, e?.message || e);
      await whatsapp.enviarTexto(m.de, DISCULPA).catch(() => {});
    }
  }

  return {
    async GET(request) {
      const q = new URL(request.url).searchParams;
      if (q.get("hub.mode") === "subscribe" && tokenVerificacion && q.get("hub.verify_token") === tokenVerificacion) {
        return new Response(q.get("hub.challenge") || "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    },

    async POST(request) {
      const crudo = await request.text();
      if (!verificarFirma(crudo, request.headers.get("x-hub-signature-256"), secreto)) return new Response("Unauthorized", { status: 401 });
      let body;
      try { body = JSON.parse(crudo); } catch { return new Response("Bad Request", { status: 400 }); }
      // Meta reintenta si no recibe 200 rápido: se responde ya y el trabajo sigue en segundo plano.
      // Los mensajes de un mismo cliente se atienden en orden.
      const porCliente = new Map();
      for (const m of extraerMensajes(body)) (porCliente.get(m.de) || porCliente.set(m.de, []).get(m.de)).push(m);
      for (const lista of porCliente.values()) enSegundoPlano(lista.reduce((p, m) => p.then(() => procesar(m)), Promise.resolve()));
      return new Response("OK", { status: 200 });
    }
  };
}
