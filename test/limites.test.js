import { describe, it, expect, vi } from "vitest";
import { limitarPlantillas } from "../api/_lib/limites.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const preparar = () => {
  const whatsapp = { enviarTexto: vi.fn(async () => ({})), enviarPlantilla: vi.fn(async () => ({})) };
  return { whatsapp, w: limitarPlantillas(whatsapp, crearAlmacenMemoria(), { porDia: 2, exentos: ["593996530276"], ahora: () => 1_000_000 }) };
};

describe("limitarPlantillas", () => {
  it("deja pasar hasta el tope diario de plantillas por número y después falla", async () => {
    const { w, whatsapp } = preparar();
    await w.enviarPlantilla("593991112233", "cita_confirmada", ["Ana"]);
    await w.enviarPlantilla("593991112233", "recordatorio_cita", ["Ana"]);
    await expect(w.enviarPlantilla("593991112233", "recordatorio_cita", ["Ana"])).rejects.toThrow(/tope/);
    await w.enviarPlantilla("593990000000", "cita_confirmada", ["Luis"]);   // otro número tiene su propio tope
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledTimes(3);
  });

  it("no limita el WhatsApp del personal ni los mensajes de texto normales", async () => {
    const { w, whatsapp } = preparar();
    for (let i = 0; i < 5; i++) await w.enviarPlantilla("593996530276", "aviso_personal", ["x"]);
    for (let i = 0; i < 5; i++) await w.enviarTexto("593991112233", "hola");
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledTimes(5);
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(5);
  });
});
