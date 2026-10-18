import { it, expect } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { abrirSesion, leerSesion, mismoOrigen, cookieCerrada, COOKIE, INACTIVIDAD_MAXIMA, DURACION_MAXIMA } from "../api/_lib/sesion-cliente.js";

const N = "notaria41";
const pedido = (cookie, init = {}) => new Request("https://sitio.test/api/cuenta", { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });
const token = (setCookie) => setCookie.split(";")[0].split("=").slice(1).join("=");

async function preparar() {
  const a = crearAlmacenMemoria();
  const c = await a.crearCliente({ notariaId: N, email: "ana@example.test", emailVerificadoEn: new Date().toISOString() });
  return { a, c };
}

it("la cookie es __Host-, HttpOnly, Secure y SameSite=Strict, y en la base queda solo la huella", async () => {
  const { a, c } = await preparar();
  const set = await abrirSesion({ almacen: a, notariaId: N, clienteId: c.id, ahora: Date.now() });
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$`));
  expect(await a.sesionCliente(token(set))).toBeNull();
  const s = await leerSesion({ almacen: a, request: pedido(`otra=1; ${set.split(";")[0]}`), notariaId: N });
  expect(s.cliente.id).toBe(c.id);
  expect(cookieCerrada()).toContain("Max-Age=0");
});

it("rechaza cookie inventada, de otra notaría, revocada, vencida o inactiva por 7 días", async () => {
  const { a, c } = await preparar();
  const t0 = Date.now();
  const set = await abrirSesion({ almacen: a, notariaId: N, clienteId: c.id, ahora: t0 });
  const req = () => pedido(set.split(";")[0]);
  expect(await leerSesion({ almacen: a, request: pedido(`${COOKIE}=${"x".repeat(43)}`), notariaId: N })).toBeNull();
  await expect(leerSesion({ almacen: a, request: req(), notariaId: "" })).rejects.toThrow();
  expect(await leerSesion({ almacen: a, request: req(), notariaId: "notaria-b" })).toBeNull();
  expect(await leerSesion({ almacen: a, request: req(), notariaId: N, ahora: t0 + INACTIVIDAD_MAXIMA + 1 })).toBeNull();
  expect(await leerSesion({ almacen: a, request: req(), notariaId: N, ahora: t0 + DURACION_MAXIMA + 1 })).toBeNull();
  await a.actualizarCliente(N, c.id, { estado: "bloqueada" });
  expect(await leerSesion({ almacen: a, request: req(), notariaId: N })).toBeNull();
  await a.actualizarCliente(N, c.id, { estado: "activa" });
  await a.revocarSesionesCliente(N, c.id);
  expect(await leerSesion({ almacen: a, request: req(), notariaId: N })).toBeNull();
});

it("contra CSRF: el POST exige JSON, X-Sofia y el mismo origen", () => {
  const post = (headers) => new Request("https://sitio.test/api/cuenta", { method: "POST", headers, body: "{}" });
  expect(mismoOrigen(post({ "content-type": "application/json", "x-sofia": "1", origin: "https://sitio.test" }))).toBe(true);
  expect(mismoOrigen(post({ "content-type": "application/json", "x-sofia": "1", origin: "https://malo.test" }))).toBe(false);
  expect(mismoOrigen(post({ "content-type": "text/plain", "x-sofia": "1" }))).toBe(false);
  expect(mismoOrigen(post({ "content-type": "application/json" }))).toBe(false);
  expect(mismoOrigen(new Request("https://sitio.test/api/cuenta"))).toBe(true);
});
