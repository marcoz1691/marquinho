// Cron diario de Vercel: recordatorio a las citas confirmadas de mañana.
import { enviarRecordatorios } from "./_lib/recordatorios.js";
import { obtenerServicios } from "./_lib/servicios.js";
import { autorizadoCron } from "./_lib/cron.js";

export async function GET(request) {
  const s = obtenerServicios();
  if (!autorizadoCron(request, s.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const enviados = await enviarRecordatorios({ almacen: s.almacen, whatsapp: s.whatsapp, contenido: s.contenido, plantilla: s.env.RECORDATORIO_PLANTILLA || "recordatorio_cita" });
  return Response.json({ enviados });
}
