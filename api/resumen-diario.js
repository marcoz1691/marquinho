// Cron de Vercel de lunes a viernes a las 07:00 de Quito: resumen de las citas de hoy al WhatsApp del personal.
import { resumenDelDia } from "./_lib/recordatorios.js";
import { obtenerServicios } from "./_lib/servicios.js";

export async function GET(request) {
  const s = obtenerServicios();
  if (request.headers.get("authorization") !== `Bearer ${s.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const citas = await resumenDelDia({ almacen: s.almacen, whatsapp: s.whatsapp, contenido: s.contenido,
    plantilla: s.env.AVISOS_PLANTILLA || "aviso_personal", destino: s.env.AVISOS_WHATSAPP });
  return Response.json({ citas });
}
