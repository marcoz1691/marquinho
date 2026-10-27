import { it, expect, vi } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
function preparar(rol = "admin") {
  const a = crearAlmacenMemoria({ personal: [{ email: "yo@test.ec", nombre: "Yo", rol }, { email: "otra@test.ec", nombre: "Otra", rol: "matricero" }] });
  a.usuarioDeToken = async () => ({ email: "yo@test.ec", email_confirmed_at: "hoy", aal: "aal2" });
  const p = crearPanel({ almacen: a });
  const m = crearManejadorPanel({ panel: p, auth: a });
  const post = b => m.POST(new Request("https://sitio.ec/api/panel", { method: "POST", headers: { authorization: "Bearer test", origin: "https://sitio.ec" }, body: JSON.stringify(b) }));
  return { a, p, m, post };
}
it.each(["admin", "notario", "matricero"])("equipo y permisos de %s", async rol => {
  const { m } = preparar(rol);
  const r = await m.GET(new Request("https://sitio.ec/api/panel?accion=equipo", { headers: { authorization: "Bearer test" } }));
  expect(r.status).toBe(rol === "matricero" ? 403 : 200);
});
it("invita, normaliza y audita; rechaza duplicado", async () => {
  const { a, post } = preparar();
  const b = { accion: "invitarMiembro", email: " ANA@test.ec ", nombre: "Ana", rol: "matricero" };
  expect((await post(b)).status).toBe(200);
  expect(await a.rolDe("ana@test.ec")).toBe("matricero");
  // El correo usa estos datos para saludar por su nombre y decir su perfil y quién la invitó.
  expect(a.invitaciones).toEqual([{ email: "ana@test.ec", redirectTo: "https://sitio.ec/panel/", datos: { nombre: "Ana", perfil: "Matricero", invito: "Yo" } }]);
  expect((await post(b)).status).toBe(409);
  expect(await a.auditoria()).toContainEqual(expect.objectContaining({ accion: "invitarMiembro", ok: false }));
});
it.each(["admin", "notario"])("notario no invita %s", async rol => {
  expect((await preparar("notario").post({ accion: "invitarMiembro", email: "n@test.ec", nombre: "Ana", rol })).status).toBe(403);
});
it.each([{ email: "mal", nombre: "Ana", rol: "matricero" }, { email: "a@test.ec", nombre: "A", rol: "matricero" }, { email: "a@test.ec", nombre: "Ana", rol: "otro" }])("valida %j", async b => {
  expect((await preparar().post({ accion: "invitarMiembro", ...b })).status).toBe(400);
});
it("revierte errores de invitación y conserva cuentas existentes", async () => {
  const { a, post } = preparar();
  a.invitar = vi.fn(async () => { throw new Error("sin conexión"); });
  const b = { accion: "invitarMiembro", email: "n@test.ec", nombre: "Ana", rol: "matricero" };
  expect((await post(b)).status).toBe(502); expect(await a.rolDe(b.email)).toBeNull();
  a.invitar = async () => ({ yaTeniaCuenta: true });
  expect(await (await post(b)).json()).toMatchObject({ yaTeniaCuenta: true });
});
it("limita a veinte invitaciones", async () => {
  const { post } = preparar();
  for (let i = 0; i < 20; i++) expect((await post({ accion: "invitarMiembro", email: `a${i}@test.ec`, nombre: "Ana", rol: "matricero" })).status).toBe(200);
  expect((await post({ accion: "invitarMiembro", email: "final@test.ec", nombre: "Ana", rol: "matricero" })).status).toBe(429);
});
it.each(["quitarMiembro", "cambiarRol"])("impide %s propio", async accion => {
  expect((await preparar().post({ accion, email: "yo@test.ec", rol: "matricero" })).status).toBe(400);
});
it("notario quita solo personal y no cambia roles", async () => {
  const { a, post } = preparar("notario");
  await a.agregarMiembro({ email: "admin@test.ec", nombre: "Admin", rol: "admin" });
  expect((await post({ accion: "quitarMiembro", email: "admin@test.ec" })).status).toBe(403);
  expect((await post({ accion: "cambiarRol", email: "otra@test.ec", rol: "notario" })).status).toBe(403);
  expect((await post({ accion: "quitarMiembro", email: "otra@test.ec" })).status).toBe(200);
});
const edicion = ["guardarPrecio", "restaurarPrecio", "guardarSBU", "restaurarSBU", "guardarCupo", "agregarBloqueo", "quitarBloqueo", "asignarCita"];
const piloto = ["guardarFuncion", "guardarPreciosMetricas", "guardarInicioPiloto"];
const comunes = ["responder", "devolver", "cita", "revisarDocumento", "borrarDocumento"];
it.each(["admin", "notario", "matricero"].flatMap(rol => [...edicion, ...piloto, ...comunes].map(accion => [rol, accion])))("matriz %s: %s", async (rol, accion) => {
  const { p, post, a } = preparar(rol);
  const metodo = { devolver: "devolverAlAsistente", cita: "decidirCita" }[accion] || accion;
  p[metodo] = vi.fn(async () => ({ ok: true }));
  const permitido = comunes.includes(accion) || (edicion.includes(accion) ? rol !== "matricero" : rol === "admin");
  expect((await post({ accion })).status).toBe(permitido ? 200 : 403);
  expect(p[metodo]).toHaveBeenCalledTimes(permitido ? 1 : 0);
  expect(await a.auditoria()).toContainEqual(expect.objectContaining({ accion, ok: permitido }));
});
it.each(["admin", "notario", "matricero"].flatMap(rol => ["funciones", "metricas", "precios", "citasConfig", "agenda", "conversaciones"].map(accion => [rol, accion])))("lectura %s: %s", async (rol, accion) => {
  const { p, m } = preparar(rol);
  p[accion] = async () => ({});
  const r = await m.GET(new Request(`https://sitio.ec/api/panel?accion=${accion}`, { headers: { authorization: "Bearer test" } }));
  expect(r.status).toBe(["funciones", "metricas"].includes(accion) && rol !== "admin" ? 403 : 200);
  if (["precios", "citasConfig"].includes(accion)) expect(await r.json()).toMatchObject({ rol, esAdmin: rol !== "matricero" });
});
it("admin cambia perfiles y quita otro admin, personal no gestiona", async () => {
  const { post, a } = preparar();
  expect((await post({ accion: "cambiarRol", email: "otra@test.ec", rol: "admin" })).status).toBe(200);
  expect((await post({ accion: "quitarMiembro", email: "otra@test.ec" })).status).toBe(200);
  expect(await a.rolDe("otra@test.ec")).toBeNull();
  const personal = preparar("matricero");
  for (const accion of ["invitarMiembro", "quitarMiembro", "cambiarRol"]) expect((await personal.post({ accion, email: "otra@test.ec", nombre: "Otra", rol: "matricero" })).status).toBe(403);
});
it.each(["quitarMiembro", "cambiarRol"])("protege último admin en %s", async accion => {
  const { a, p } = preparar("notario");
  await a.agregarMiembro({ email: "ultimo@test.ec", nombre: "Último", rol: "admin" });
  await expect(p[accion]({ email: "ultimo@test.ec", rol: "matricero" }, "ultimo@test.ec")).rejects.toThrow(/propio|ti mismo/);
  // Simula una degradación entre autorización y lectura del equipo.
  const original = a.rolDe.bind(a);
  a.rolDe = async email => email === "yo@test.ec" ? "admin" : original(email);
  await expect(p[accion]({ email: "ultimo@test.ec", rol: "matricero" }, "yo@test.ec")).rejects.toThrow(/último administrador/);
});

it("no deja darse de baja a sí mismo aunque el correo de la sesión tenga mayúsculas", async () => {
  const { crearAlmacenMemoria } = await import("../api/_lib/almacen-memoria.js");
  const { crearPanel } = await import("../api/_lib/panel.js");
  const almacen = crearAlmacenMemoria();
  await almacen.agregarMiembro({ email: "jefe@n.ec", nombre: "Jefe", rol: "admin" });
  await almacen.agregarMiembro({ email: "otro@n.ec", nombre: "Otro", rol: "admin" });
  const panel = crearPanel({ almacen, whatsapp: {}, contenido: async () => ({ data: { tramites: [] }, notaria: {} }) });
  await expect(panel.quitarMiembro({ email: "jefe@n.ec" }, "Jefe@N.ec")).rejects.toThrow("No puedes darte de baja a ti mismo.");
});
