// Cron diario de Vercel: recordatorio a las citas confirmadas de mañana.
import { registrar } from "./_lib/metricas.js";
import { fechaQuito, sumarDias } from "./_lib/citas.js";
import { enviarRecordatorios } from "./_lib/recordatorios.js";
import { obtenerServicios } from "./_lib/servicios.js";
import { autorizadoCron } from "./_lib/cron.js";

export async function GET(request) {
  const s = obtenerServicios();
  if (!autorizadoCron(request, s.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const ayer = sumarDias(fechaQuito(new Date()), -1);
  try {
    await registrar(s.almacen, "cita.inasistencia", (await s.almacen.agenda(ayer)).filter(c => c.estado === "confirmada").length);
  } catch (e) { console.error("No se pudieron contar las inasistencias:", e); }
  const enviados = await enviarRecordatorios({ almacen: s.almacen, whatsapp: s.whatsapp, contenido: s.contenido, plantilla: s.env.RECORDATORIO_PLANTILLA || "recordatorio_cita" });
  return Response.json({ enviados });
}
