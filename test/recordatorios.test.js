import { describe, it, expect, vi } from "vitest";
import { enviarRecordatorios, resumenDelDia } from "../api/_lib/recordatorios.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const contenido = async () => ({ data: { tramites: [{ id: "poder", nombre: "Poder especial" }] } });

describe("enviarRecordatorios", () => {
  it("envía la plantilla de recordatorio a las citas confirmadas de mañana (hora de Quito)", async () => {
    const almacen = crearAlmacenMemoria();
    const c = await almacen.conversacion("593991112233", "Ana");
    const { id } = await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-07", hora: "09:30", nombre: "Ana" });
    await almacen.actualizarCita(id, { estado: "confirmada" });
    await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-07", hora: "11:00", nombre: "Ana" }); // pendiente: no
    const whatsapp = { enviarPlantilla: vi.fn(async () => ({})) };
    // 6 de octubre, 22:30 en Quito = 7 de octubre 03:30 UTC: "mañana" sigue siendo el 7.
    const n = await enviarRecordatorios({ almacen, whatsapp, contenido, plantilla: "recordatorio_cita", ahora: () => new Date("2026-10-07T03:30:00Z") });
    expect(n).toBe(1);
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledWith("593991112233", "recordatorio_cita", ["Ana", "Poder especial", "09:30"]);
  });

  it("no repite el recordatorio si el cron corre dos veces", async () => {
    const almacen = crearAlmacenMemoria();
    const c = await almacen.conversacion("5931", "Ana");
    const { id } = await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-07", hora: "09:30", nombre: "Ana" });
    await almacen.actualizarCita(id, { estado: "confirmada" });
    const whatsapp = { enviarPlantilla: vi.fn(async () => ({})) };
    const args = { almacen, whatsapp, contenido, plantilla: "recordatorio_cita", ahora: () => new Date("2026-10-06T15:00:00Z") };
    await enviarRecordatorios(args); await enviarRecordatorios(args);
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledTimes(1);
  });

  it("sigue con las demás citas si un envío falla", async () => {
    const almacen = crearAlmacenMemoria();
    for (const tel of ["5931", "5932"]) {
      const c = await almacen.conversacion(tel, "X");
      const { id } = await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: null, fecha: "2026-10-07", hora: "10:00", nombre: "X" });
      await almacen.actualizarCita(id, { estado: "confirmada" });
    }
    const whatsapp = { enviarPlantilla: vi.fn().mockRejectedValueOnce(new Error("plantilla no aprobada")).mockResolvedValueOnce({}) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const n = await enviarRecordatorios({ almacen, whatsapp, contenido, plantilla: "recordatorio_cita", ahora: () => new Date("2026-10-06T15:00:00Z") });
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledTimes(2);
    expect(n).toBe(1);
  });
});

describe("resumenDelDia", () => {
  const ahora = () => new Date("2026-10-07T12:00:00Z"); // 07:00 en Quito

  it("manda al personal la lista de citas de hoy por hora, con las pendientes marcadas", async () => {
    const almacen = crearAlmacenMemoria();
    const c = await almacen.conversacion("593991112233", "Ana");
    await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-07", hora: "11:00", nombre: "Luis", estado: "confirmada" });
    await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: null, fecha: "2026-10-07", hora: "09:00", nombre: "Ana" });
    const r = await almacen.crearSolicitudCita({ conversacionId: c.id, tramiteId: "poder", fecha: "2026-10-07", hora: "10:00", nombre: "Eva" });
    await almacen.actualizarCita(r.id, { estado: "rechazada" });
    const whatsapp = { enviarPlantilla: vi.fn(async () => ({})) };
    const n = await resumenDelDia({ almacen, whatsapp, contenido, plantilla: "aviso_personal", destino: "593996530276", ahora });
    expect(n).toBe(2);
    const [destino, plantilla, [texto]] = whatsapp.enviarPlantilla.mock.calls[0];
    expect([destino, plantilla]).toEqual(["593996530276", "aviso_personal"]);
    expect(texto).toMatch(/Citas de hoy \(2\).*09:00 Ana.*pendiente.*11:00 Luis.*Poder especial/);
    expect(texto).not.toMatch(/Eva/);
    expect(texto).not.toMatch(/\n/);
  });

  it("no manda nada si hoy no hay citas", async () => {
    const whatsapp = { enviarPlantilla: vi.fn(async () => ({})) };
    expect(await resumenDelDia({ almacen: crearAlmacenMemoria(), whatsapp, contenido, plantilla: "aviso_personal", destino: "593996530276", ahora })).toBe(0);
    expect(whatsapp.enviarPlantilla).not.toHaveBeenCalled();
  });
});
