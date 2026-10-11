import { it, expect, vi } from "vitest";
import { registrar, canalDeTelefono } from "../api/_lib/metricas.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearPanel } from "../api/_lib/panel.js";
it("registra en Quito, ignora cero y atrapa errores", async () => {
 const sumarMetrica = vi.fn();
 await registrar({ sumarMetrica }, "ia.llamadas", 1, Date.parse("2026-10-12T02:00Z"));
 expect(sumarMetrica).toHaveBeenCalledWith("2026-10-11", "ia.llamadas", 1);
 await registrar({ sumarMetrica }, "x", 0); expect(sumarMetrica).toHaveBeenCalledTimes(1);
 await expect(registrar({ sumarMetrica: async () => { throw Error("métrica"); } }, "x")).resolves.toBeUndefined();
 expect(canalDeTelefono("form:123")).toBe("formulario");
});
it("agrega métricas y calcula costos con precios editables", async () => {
 const almacen = crearAlmacenMemoria(), panel = crearPanel({ almacen });
 await almacen.sumarMetrica("2026-10-11", "ia.tokens_entrada", 1000000);
 await almacen.sumarMetrica("2026-10-11", "conv.nueva.web", 2);
 expect((await panel.metricas("2026-10-11", "2026-10-11")).costo).toMatchObject({ ia: 4, porConversacion: 2 });
 await almacen.guardarAjuste("metricas.precio.entrada", "8", "admin");
 expect((await panel.metricas("2026-10-11", "2026-10-11")).costo.ia).toBe(8);
 await expect(panel.metricas("2026-02-30", "2026-10-11")).rejects.toThrow();
});
it("guarda el autor de funciones y valida los precios e inicio", async () => {
 const almacen = crearAlmacenMemoria(), panel = crearPanel({ almacen, ahora: () => new Date("2026-10-11T15:00Z") });
 await panel.guardarFuncion({ id: "agenda", activa: false }, "admin");
 expect((await panel.funciones()).funciones.find(f => f.id === "agenda")).toMatchObject({ activa: false, actualizadoPor: "admin", actualizadoEn: expect.any(String) });
 await expect(panel.guardarFuncion({ id: "inventada", activa: true }, "admin")).rejects.toThrow();
 await expect(panel.guardarPreciosMetricas({ entrada: -1 }, "admin")).rejects.toThrow();
 expect((await panel.guardarInicioPiloto({ fecha: "2026-10-11" }, "admin")).pilotoInicio).toBe("2026-10-11");
 expect((await panel.guardarInicioPiloto({ fecha: null }, "admin")).pilotoInicio).toBeNull();
 for (const [desde, hasta] of [["2026-01-01", "2027-01-02"], ["2026-10-12", "2026-10-11"], [undefined, "mal"]]) await expect(panel.metricas(desde, hasta)).rejects.toThrow();
});
it("calcula todos los tipos de tokens y WhatsApp sin conversaciones", async () => {
 const almacen = crearAlmacenMemoria(), panel = crearPanel({ almacen });
 for (const clave of ["ia.tokens_entrada", "ia.tokens_salida", "ia.tokens_cache_lectura", "ia.tokens_cache_escritura"]) await almacen.sumarMetrica("2026-10-11", clave, 1000000);
 await almacen.sumarMetrica("2026-10-11", "recordatorio.enviado", 2); await almacen.sumarMetrica("2026-10-11", "respuesta.automatica", 3);
 await almacen.guardarAjuste("metricas.precio.plantillaWhatsapp", "0.1", "admin");
 const m = await panel.metricas("2026-10-11", "2026-10-11");
 expect(m.costo).toEqual({ ia: 29.2, whatsapp: 0.5, total: 29.7, porConversacion: 0 });
 expect(m.porDia).toHaveLength(1); expect(m.totales["cita.atendida"]).toBe(0);
});
