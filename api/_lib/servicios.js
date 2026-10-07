// Dependencias reales armadas desde las variables de entorno (se crean una vez por instancia).
import Anthropic from "@anthropic-ai/sdk";
import { crearWhatsApp } from "./whatsapp.js";
import { crearAlmacenSupabase } from "./almacen-supabase.js";
import { crearAlmacenMemoria } from "./almacen-memoria.js";
import { crearContenido } from "./contenido.js";
import { crearAsistente } from "./asistente.js";
import { crearPanel } from "./panel.js";
import { limitarPlantillas } from "./limites.js";

let servicios;

export function obtenerServicios(env = process.env) {
  if (servicios) return servicios;
  // Sin Supabase configurado se usa memoria: solo sirve para pruebas locales, se pierde al reiniciar.
  if (!env.SUPABASE_URL && env.VERCEL_ENV === "production") throw new Error("Falta SUPABASE_URL: en producción el almacén en memoria perdería conversaciones y documentos.");
  const almacen = env.SUPABASE_URL ? crearAlmacenSupabase({ url: env.SUPABASE_URL, clave: env.SUPABASE_SERVICE_ROLE_KEY }) : crearAlmacenMemoria();
  const whatsapp = limitarPlantillas(crearWhatsApp({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, version: env.WHATSAPP_API_VERSION || "v23.0" }),
    almacen, { exentos: [env.AVISOS_WHATSAPP].filter(Boolean) });
  const contenido = crearContenido();
  const avisar = async (texto) => {
    if (!env.AVISOS_WHATSAPP) return;
    try { await whatsapp.enviarPlantilla(env.AVISOS_WHATSAPP, env.AVISOS_PLANTILLA || "aviso_personal", [texto.slice(0, 1000)]); }
    catch (e) { console.error("No se pudo avisar al personal:", e.message); }
  };
  const asistente = crearAsistente({ claude: new Anthropic({ timeout: 90 * 1000, maxRetries: 1 }), almacen, whatsapp, contenido, avisar });
  const panel = crearPanel({ almacen, whatsapp, contenido,
    plantillas: { citaConfirmada: env.CITA_CONFIRMADA_PLANTILLA || "cita_confirmada", citaRechazada: env.CITA_RECHAZADA_PLANTILLA || "cita_rechazada" } });
  servicios = { whatsapp, almacen, contenido, asistente, panel, env };
  return servicios;
}
