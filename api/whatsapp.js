// Webhook de WhatsApp Cloud API: https://<dominio>/api/whatsapp
import { waitUntil } from "@vercel/functions";
import { crearManejador } from "./_lib/webhook.js";
import { obtenerServicios } from "./_lib/servicios.js";

const manejador = () => {
  const s = obtenerServicios();
  return crearManejador({ asistente: s.asistente, whatsapp: s.whatsapp, secreto: s.env.WHATSAPP_APP_SECRET,
    tokenVerificacion: s.env.WHATSAPP_VERIFY_TOKEN, enSegundoPlano: waitUntil });
};

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
