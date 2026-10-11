import { it, expect, vi } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
const estado = vi.hoisted(() => ({}));
vi.mock("../api/_lib/servicios.js", () => ({ obtenerServicios: () => estado.s }));
import { GET } from "../api/recordatorios.js";
it("cuenta las citas confirmadas de ayer en Quito, incluso sin recordatorios", async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T02:00:00Z"));
 try {
 const almacen = crearAlmacenMemoria(), c = await almacen.conversacion("5931");
 await almacen.guardarAjuste("funcion.recordatorios", "0", "admin");
 for (const estado of ["confirmada", "atendida", "pendiente"]) await almacen.crearSolicitudCita({ conversacionId: c.id, fecha: "2026-10-10", hora: "09:00", estado });
 const secreto = "s".repeat(32); estado.s = { almacen, env: { CRON_SECRET: secreto } };
 expect((await GET(new Request("https://x/api/recordatorios", { headers: { authorization: "Bearer " + secreto } }))).status).toBe(200);
 // Si el cron se repite el mismo día (reintento de Vercel), las inasistencias no se cuentan dos veces.
 expect((await GET(new Request("https://x/api/recordatorios", { headers: { authorization: "Bearer " + secreto } }))).status).toBe(200);
 expect(await almacen.metricas("2026-10-11", "2026-10-11")).toContainEqual({ fecha: "2026-10-11", clave: "cita.inasistencia", valor: 1 });
 } finally { vi.useRealTimers(); }
});
