// Colisiones y consultas con un cliente falso: no se conecta a ninguna base.
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearAlmacenSupabase } from "../api/_lib/almacen-supabase.js";

const solicitud = { conversacionId: "c1", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" };
function clienteFalso(resultados) {
  const log = [];
  return { log, from(tabla) {
    const ops = [], q = {};
    for (const metodo of ["insert", "select", "single", "maybeSingle", "eq", "gte", "in", "order"]) q[metodo] = (...args) => { ops.push([metodo, ...args]); return q; };
    q.then = (res, rej) => { log.push({ tabla, ops }); return Promise.resolve(resultados.shift()).then(res, rej); };
    return q;
  } };
}

describe("tickets en memoria", () => {
  it("reintenta una colisión del mismo día y permite el mismo código otro día", async () => {
    const azar = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
    try {
      const a = crearAlmacenMemoria();
      expect((await a.crearSolicitudCita(solicitud)).codigo).toBe("1000");
      expect((await a.crearSolicitudCita(solicitud)).codigo).toBe("5500");
      expect((await a.crearSolicitudCita({ ...solicitud, fecha: "2026-10-09" })).codigo).toBe("1000");
      expect(azar).toHaveBeenCalledTimes(4);
    } finally { azar.mockRestore(); }
  });
  it("falla tras ocho intentos y no agrega una cita sin ticket", async () => {
    const azar = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const a = crearAlmacenMemoria();
      await a.crearSolicitudCita(solicitud);
      azar.mockClear();
      await expect(a.crearSolicitudCita(solicitud)).rejects.toThrow(/ticket único/);
      expect(azar).toHaveBeenCalledTimes(8);
      expect(await a.solicitudesCita("c1")).toHaveLength(1);
    } finally { azar.mockRestore(); }
  });
});

describe("tickets en Supabase", () => {
  it("reintenta el error 23505 y devuelve id y codigo", async () => {
    const cliente = clienteFalso([{ error: { code: "23505" } }, { data: { id: "1", codigo: "5500" } }]);
    const azar = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    try {
      expect(await crearAlmacenSupabase({ cliente }).crearSolicitudCita(solicitud)).toEqual({ id: "1", codigo: "5500" });
      expect(cliente.log.map((x) => x.ops[0][1].codigo)).toEqual(["1000", "5500"]);
      expect(cliente.log[1].ops).toContainEqual(["select", "id, codigo"]);
    } finally { azar.mockRestore(); }
  });
  it("falla tras ocho colisiones", async () => {
    const cliente = clienteFalso(Array.from({ length: 8 }, () => ({ error: { code: "23505" } })));
    await expect(crearAlmacenSupabase({ cliente }).crearSolicitudCita(solicitud)).rejects.toThrow(/ticket único/);
    expect(cliente.log).toHaveLength(8);
  });
  it("no reintenta otros errores", async () => {
    const cliente = clienteFalso([{ error: { code: "42501", message: "denegado" } }]);
    await expect(crearAlmacenSupabase({ cliente }).crearSolicitudCita(solicitud)).rejects.toThrow(/denegado/);
    expect(cliente.log).toHaveLength(1);
  });
  it("las citas antiguas tienen codigo null", async () => {
    const cliente = clienteFalso([{ data: { id: "vieja" } }]);
    expect(await crearAlmacenSupabase({ cliente }).cita("vieja")).toMatchObject({ codigo: null });
  });
  it("consulta por código, fecha y estados activos con el contacto de agenda", async () => {
    const cliente = clienteFalso([{ data: [{ codigo: "4821", contacto: "593991112233", conversaciones: { telefono: "web:sesion" } }] }]);
    const citas = await crearAlmacenSupabase({ cliente }).citasPorCodigo("4821", "2026-10-07");
    expect(citas[0]).toMatchObject({ codigo: "4821", telefono: "593991112233" });
    expect(cliente.log[0].ops).toEqual(expect.arrayContaining([["eq", "codigo", "4821"], ["gte", "fecha", "2026-10-07"], ["in", "estado", ["pendiente", "confirmada"]]]));
  });
});

it("el esquema agrega una columna nullable e índice único por día", async () => {
  const sql = await readFile(new URL("../supabase/esquema.sql", import.meta.url), "utf8");
  expect(sql).toMatch(/add column if not exists codigo text/);
  expect(sql).toMatch(/create unique index if not exists solicitudes_cita_fecha_codigo on solicitudes_cita\(fecha, codigo\)/);
});
