import { it, expect, vi } from "vitest";
import { registrarEvento, TEXTOS } from "../api/_lib/eventos.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { emitirVinculo, consumirVinculo } from "../api/_lib/vinculos.js";

it("registra el evento con el texto por defecto y queda en la línea de tiempo del cliente", async () => {
  const almacen = crearAlmacenMemoria(), conv = await almacen.conversacion("form:593991234567", "Ana");
  const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-20", hora: "09:00", nombre: "Ana" });
  expect(await registrarEvento(almacen, { notariaId: "notaria41", solicitudId: id, tipo: "creada", actor: "cliente" })).toBe(true);
  await registrarEvento(almacen, { notariaId: "notaria41", solicitudId: id, tipo: "nota", textoCliente: "interno", visibleCliente: false, actor: "personal" });
  const cliente = await almacen.crearCliente({ notariaId: "notaria41", email: "ana@ejemplo.ec", emailVerificadoEn: new Date().toISOString() });
  const { token } = await emitirVinculo({ almacen, notariaId: "notaria41", solicitudId: id });
  await consumirVinculo({ almacen, notariaId: "notaria41", clienteId: cliente.id, token });
  const { eventos } = await almacen.tramiteDeCliente("notaria41", cliente.id, id);
  expect(eventos[0]).toMatchObject({ tipo: "creada", texto: "Recibimos tu solicitud de cita.", actor: "cliente" });
  expect(JSON.stringify(eventos)).not.toContain("interno");
});

it("nunca lanza: si el almacén falla, avisa sin datos personales y devuelve false", async () => {
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  const roto = { registrarEventoTramite: async () => { throw Object.assign(new Error("fila de ana@ejemplo.ec 0991234567"), { code: "XX000" }); } };
  await expect(registrarEvento(roto, { notariaId: "notaria41", solicitudId: "s1", tipo: "confirmada" })).resolves.toBe(false);
  await expect(registrarEvento({}, { solicitudId: "s1", tipo: "confirmada" })).resolves.toBe(false);
  expect(aviso).toHaveBeenCalled();
  expect(JSON.stringify(aviso.mock.calls)).not.toMatch(/ana@|0991234567/);
  aviso.mockRestore();
});

it("sin trámite no registra nada", async () => {
  const almacen = { registrarEventoTramite: vi.fn() };
  expect(await registrarEvento(almacen, { solicitudId: null, tipo: "documento_aprobado" })).toBe(false);
  expect(almacen.registrarEventoTramite).not.toHaveBeenCalled();
});

it("los textos tratan de tú y no prometen resultados que solo da el notario", () => {
  expect(Object.keys(TEXTOS)).toEqual(["creada", "confirmada", "rechazada", "atendida", "documento_aprobado", "documento_observado"]);
  expect(Object.values(TEXTOS).join(" ")).not.toMatch(/usted|validado por IA|aprobado automáticamente|acto completado|firma garantizada/i);
});
