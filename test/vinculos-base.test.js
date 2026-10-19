// Contrato base de vinculación (api/_lib/vinculos.js): el ticket nunca vincula; solo un token de un solo uso.
import { it, expect } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { emitirVinculo, consumirVinculo, tokenValido, huellaToken } from "../api/_lib/vinculos.js";

const N = "notaria41";
async function preparar() {
  const a = crearAlmacenMemoria();
  const conv = await a.conversacion("form:593991112233", "Ana");
  const { id, codigo } = await a.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-01-05", hora: "09:00", nombre: "Ana" });
  const ana = await a.crearCliente({ notariaId: N, email: "ana@example.test", emailVerificadoEn: new Date().toISOString() });
  return { a, id, codigo, ana };
}

it("emite un token de 43 caracteres, guarda solo su huella y vincula una sola vez con evento y auditoría", async () => {
  const { a, id, ana } = await preparar();
  const { token, expira } = await emitirVinculo({ almacen: a, notariaId: N, solicitudId: id, ahora: 0 });
  expect(tokenValido(token)).toBe(true);
  expect(expira).toBe(24 * 3600e3);
  expect(await consumirVinculo({ almacen: a, notariaId: N, clienteId: ana.id, token, ahora: 1 })).toBe(id);
  expect(await consumirVinculo({ almacen: a, notariaId: N, clienteId: ana.id, token, ahora: 2 })).toBeNull();
  expect((await a.tramiteDeCliente(N, ana.id, id)).eventos.map((e) => e.tipo)).toEqual(["vinculada"]);
  const aud = await a.auditoria();
  expect(aud.map((x) => x.ok)).toEqual([true, false]);
  expect(JSON.stringify(aud)).not.toContain(token);
  expect(aud[0].objetivo).toBe(huellaToken(token).slice(0, 8));
});

it("rechaza el ticket como si fuera token y no vincula", async () => {
  const { a, id, codigo, ana } = await preparar();
  expect(await consumirVinculo({ almacen: a, notariaId: N, clienteId: ana.id, token: codigo })).toBeNull();
  expect(await consumirVinculo({ almacen: a, notariaId: N, clienteId: ana.id, token: codigo + "593991112233" })).toBeNull();
  expect(await a.tramitesDeCliente(N, ana.id)).toEqual([]);
  expect((await a.cita(id)).clienteId).toBeNull();
});
