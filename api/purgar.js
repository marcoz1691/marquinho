// Cron diario de Vercel a las 03:00 de Quito: aplica la retención de datos (ver _lib/purgar.js).
import { purgarDatos } from "./_lib/purgar.js";
import { obtenerServicios } from "./_lib/servicios.js";
import { autorizadoCron } from "./_lib/cron.js";

export async function GET(request) {
  const s = obtenerServicios();
  if (!autorizadoCron(request, s.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await purgarDatos({ almacen: s.almacen, retencionDias: s.env.RETENCION_DIAS }));
}
