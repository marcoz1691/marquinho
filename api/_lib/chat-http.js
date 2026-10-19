import { leerAjustes, errorWeb, funcionActiva } from "./funciones.js";
import { registrar } from "./metricas.js";
// API del chat de la página web: el mismo asistente que WhatsApp, con límites para acotar costos y abusos.
import { huellaIp } from "./huella.js";
import { AVISO_PRIVACIDAD } from "./privacidad.js";
import { registrarConsentimiento } from "./consentimiento.js";

const HORA = 3600 * 1000, DIA = 24 * HORA;
const LIMITES = { porSesion: 30, porIp: 80, porDia: 1500 };
const SATURADO = "Por ahora el asistente de la web recibió muchos mensajes. Escríbenos por WhatsApp o llama a la notaría y te ayudamos.";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const TEXTO_CHAT = "Casillas del chat web: acepto los términos y condiciones; autorizo el tratamiento de mis datos según el aviso de privacidad";

export function crearManejadorChat({ asistente, almacen, ahora = () => Date.now(), limites = LIMITES }) {
  return {
    async POST(request) {
      const ajustes = await leerAjustes(almacen), apagada = errorWeb(ajustes, "chatWeb");
      if (apagada) return json(apagada, 503);
      let b;
      try { b = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
      const sesion = String(b?.sesion || ""), texto = String(b?.texto || "").trim();
      if (!/^[A-Za-z0-9_-]{12,64}$/.test(sesion)) return json({ error: "Sesión inválida" }, 400);
      if (!texto) return json({ error: "Escribe un mensaje" }, 400);
      if (texto.length > 1000) return json({ error: "El mensaje es muy largo (máximo 1000 caracteres)" }, 400);
      // Antes del primer mensaje la persona marca dos casillas separadas: términos y tratamiento de datos (LOPDP, art. 8).
      if (b.aceptaTerminos !== true || b.aceptaDatos !== true)
        return json({ error: "Acepta los términos y autoriza el tratamiento de tus datos para chatear.", aceptacion: true }, 400);

      // La IP se guarda solo como huella (hash), nunca en claro.
      const huella = huellaIp(request);
      const t = ahora();
      const [nSesion, nIp, nDia] = await Promise.all([
        almacen.contarUso("chat:sesion:" + sesion, HORA, t),
        almacen.contarUso("chat:ip:" + huella, HORA, t),
        almacen.contarUso("chat:dia", DIA, t)
      ]);
      if (nSesion > limites.porSesion || nIp > limites.porIp || nDia > limites.porDia) return json({ error: SATURADO }, 429);

      const conv = await almacen.conversacion("web:" + sesion, "");
      if (!conv.consentimiento) {
        await almacen.actualizarConversacion(conv.id, { consentimiento: true, consentimientoEn: new Date(t).toISOString(),
          consentimientoTexto: TEXTO_CHAT, consentimientoAviso: AVISO_PRIVACIDAD });
        await registrarConsentimiento(almacen, { canal: "chat-web", titular: "web:" + sesion, texto: TEXTO_CHAT, t: new Date(t) });
      }
      const eventos = [];
      const respuestas = await asistente.atender({ id: "web." + t + "." + Math.random().toString(36).slice(2, 10), de: "web:" + sesion, nombre: "", tipo: "texto", texto, canal: "web" }, { eventos });
      const tarjetas = eventos.filter((e) => e.tipo === "cita").map((e) => ({ ...e.resumen, subirDocumentos: funcionActiva(ajustes, "documentos"), ...(e.vinculo ? { vinculo: e.vinculo } : {}) }));
      return json({ respuestas, tarjetas, ...(!respuestas.length ? { ocupado: true } : {}) });
    }
  };
}
