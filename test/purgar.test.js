import { describe, it, expect, vi } from "vitest";
import { purgarDatos } from "../api/_lib/purgar.js";

const DIA = 864e5;

describe("purgarDatos", () => {
  it("borra lo inactivo según la retención y los documentos borrados hace más de 7 días", async () => {
    const almacen = { purgar: vi.fn(async () => ({ conversaciones: 2, documentos: 3 })) };
    const ahora = () => new Date("2026-10-07T08:00:00Z");   // 03:00 en Quito
    const r = await purgarDatos({ almacen, ahora, retencionDias: 90 });
    expect(r).toEqual({ conversaciones: 2, documentos: 3 });
    expect(almacen.purgar).toHaveBeenCalledWith({
      inactivasAntesDe: ahora().getTime() - 90 * DIA,
      borradosAntesDe: ahora().getTime() - 7 * DIA,
      hoy: "2026-10-07"
    });
  });

  it("nunca usa una retención menor a 30 días aunque se configure mal", async () => {
    const almacen = { purgar: vi.fn(async () => ({})) };
    const ahora = () => new Date("2026-10-07T08:00:00Z");
    await purgarDatos({ almacen, ahora, retencionDias: "3" });
    expect(almacen.purgar.mock.calls[0][0].inactivasAntesDe).toBe(ahora().getTime() - 30 * DIA);
    await purgarDatos({ almacen, ahora, retencionDias: "abc" });
    expect(almacen.purgar.mock.calls[1][0].inactivasAntesDe).toBe(ahora().getTime() - 90 * DIA);
    await purgarDatos({ almacen, ahora, retencionDias: "  " });
    expect(almacen.purgar.mock.calls[2][0].inactivasAntesDe).toBe(ahora().getTime() - 90 * DIA);
  });
});
