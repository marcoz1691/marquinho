// La purga de Supabase no se puede probar contra una base real sin un proyecto de pruebas: aquí se usa un cliente falso que
// graba cada llamada, para comprobar el orden (filas antes que archivos), las condiciones y los lotes.
import { describe, it, expect, vi } from "vitest";
import { crearAlmacenSupabase } from "../api/_lib/almacen-supabase.js";

function clienteFalso({ conversaciones = [], citas = [], documentos = [], falloStorage = null }) {
  const log = [];
  const from = (tabla) => {
    const q = { tabla, ops: [] };
    const reg = (nombre) => (...args) => { q.ops.push([nombre, ...args]); return q; };
    for (const m of ["select", "lt", "gte", "in", "not", "eq", "is", "order", "limit", "delete", "update", "insert"]) q[m] = reg(m);
    q.then = (res, rej) => {
      log.push({ tabla, ops: q.ops });
      const es = (m) => q.ops.some((o) => o[0] === m);
      let data = [];
      if (tabla === "conversaciones" && es("delete")) data = q.ops.find((o) => o[0] === "in")[2].map((id) => ({ id }));
      else if (tabla === "conversaciones") data = conversaciones.splice(0, 50).map((id) => ({ id }));
      else if (tabla === "solicitudes_cita") data = citas;
      else if (tabla === "documentos" && es("not")) data = documentos.splice(0, 50);
      else if (tabla === "documentos" && es("select")) data = [{ ruta: "c1/a.pdf" }, { ruta: "c1/b.pdf" }];
      return Promise.resolve({ data, error: null }).then(res, rej);
    };
    return q;
  };
  const storage = { from: () => ({ remove: async (rutas) => { log.push({ tabla: "storage", rutas }); return { error: falloStorage }; } }) };
  return { cliente: { from, storage }, log };
}
const args = { inactivasAntesDe: 1_000_000, borradosAntesDe: 2_000_000, hoy: "2026-10-07" };

describe("purgar (Supabase)", () => {
  it("borra primero las filas y después los archivos, repitiendo las condiciones de inactividad al borrar", async () => {
    const { cliente, log } = clienteFalso({ conversaciones: ["c1", "c2"] });
    const r = await crearAlmacenSupabase({ cliente }).purgar(args);
    expect(r).toEqual({ conversaciones: 2, documentos: 2 });
    const iBorrado = log.findIndex((l) => l.tabla === "conversaciones" && l.ops.some((o) => o[0] === "delete"));
    const iArchivos = log.findIndex((l) => l.tabla === "storage");
    expect(iBorrado).toBeGreaterThan(-1);
    expect(iArchivos).toBeGreaterThan(iBorrado);
    const borrado = log[iBorrado].ops.map((o) => o[0]);
    expect(borrado).toEqual(expect.arrayContaining(["in", "lt", "lt", "lt"]));   // ultima_actividad_ms, cliente_en_ms, creada
  });

  it("no borra las conversaciones que tienen una cita por venir", async () => {
    const { cliente, log } = clienteFalso({ conversaciones: ["c1", "c2"], citas: [{ conversacion_id: "c1" }] });
    await crearAlmacenSupabase({ cliente }).purgar(args);
    const borrado = log.find((l) => l.tabla === "conversaciones" && l.ops.some((o) => o[0] === "delete"));
    expect(borrado.ops.find((o) => o[0] === "in")[2]).toEqual(["c2"]);
  });

  it("si el almacenamiento falla, no deja filas con enlaces rotos y no interrumpe la purga", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente } = clienteFalso({ conversaciones: ["c1"], falloStorage: { message: "storage caído" } });
    await expect(crearAlmacenSupabase({ cliente }).purgar(args)).resolves.toMatchObject({ conversaciones: 1 });
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("procesa los documentos borrados desde el panel en lotes, filas antes que archivos", async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({ id: "d" + i, ruta: `c/${i}.pdf` }));
    const { cliente, log } = clienteFalso({ documentos: docs });
    const r = await crearAlmacenSupabase({ cliente }).purgar(args);
    expect(r.documentos).toBe(3);
    const iFilas = log.findIndex((l) => l.tabla === "documentos" && l.ops.some((o) => o[0] === "delete"));
    expect(log.findIndex((l) => l.tabla === "storage")).toBeGreaterThan(iFilas);
  });

  it("limita cada lote a 50 conversaciones", async () => {
    const { cliente, log } = clienteFalso({ conversaciones: Array.from({ length: 50 }, (_, i) => "c" + i) });
    await crearAlmacenSupabase({ cliente }).purgar(args);
    const seleccion = log.find((l) => l.tabla === "conversaciones" && l.ops.some((o) => o[0] === "limit"));
    expect(seleccion.ops.find((o) => o[0] === "limit")[1]).toBe(50);
  });
});

describe("usuarioDeToken (Supabase)", () => {
  const jwt = (carga) => ["x", Buffer.from(JSON.stringify(carga)).toString("base64url"), "y"].join(".");
  const cliente = (user, error = null) => ({ auth: { getUser: async () => ({ data: { user }, error }) } });

  it("agrega el nivel de verificación (aal) que trae el token ya validado por Supabase", async () => {
    const u = await crearAlmacenSupabase({ cliente: cliente({ email: "a@x.ec" }) }).usuarioDeToken(jwt({ aal: "aal2" }));
    expect(u).toMatchObject({ email: "a@x.ec", aal: "aal2" });
  });

  it("sin el dato, o con un token ilegible, queda como aal1 (nunca como aal2)", async () => {
    const a = crearAlmacenSupabase({ cliente: cliente({ email: "a@x.ec" }) });
    expect((await a.usuarioDeToken(jwt({}))).aal).toBe("aal1");
    expect((await a.usuarioDeToken("basura")).aal).toBe("aal1");
  });

  it("devuelve null si Supabase rechaza el token", async () => {
    expect(await crearAlmacenSupabase({ cliente: cliente(null, { message: "jwt expired" }) }).usuarioDeToken(jwt({ aal: "aal2" }))).toBeNull();
  });
});
