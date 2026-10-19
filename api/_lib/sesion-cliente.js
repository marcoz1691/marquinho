// Sesión del cliente del portal (docs/adr/0004): token aleatorio en una cookie HttpOnly; en la base solo su sha256.
// Lo usan la cuenta (cuenta-http.js) y los pagos (pagos-http.js). Nunca se mezcla con la sesión del personal.
import { randomBytes, createHash } from "node:crypto";
import { exigirNotaria } from "./notaria.js";

export const COOKIE = "__Host-sp_sesion";
const DIA = 864e5;
export const DURACION_MAXIMA = 30 * DIA, INACTIVIDAD_MAXIMA = 7 * DIA;
export const huellaSesion = (token) => createHash("sha256").update(String(token)).digest("hex");

function leerCookie(request) {
  for (const parte of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return "";
}
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const cookieCerrada = () => cookie("", 0);

// Crea la sesión y devuelve la cabecera Set-Cookie.
export async function abrirSesion({ almacen, notariaId, clienteId, ahora = Date.now() }) {
  exigirNotaria(notariaId);
  const token = randomBytes(32).toString("base64url");
  await almacen.crearSesionCliente({ notariaId, clienteId, tokenHash: huellaSesion(token), expiraEn: new Date(ahora + DURACION_MAXIMA).toISOString() });
  return cookie(token, Math.floor(DURACION_MAXIMA / 1000));
}

// Devuelve { cliente, sesion } si la cookie es válida para esta notaría; si no, null. Renueva la actividad como mucho cada hora.
export async function leerSesion({ almacen, request, notariaId, ahora = Date.now() }) {
  exigirNotaria(notariaId);
  const token = leerCookie(request);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sesion = await almacen.sesionCliente(huellaSesion(token));
  if (!sesion || sesion.notariaId !== notariaId || sesion.revocadaEn) return null;
  if (Date.parse(sesion.expiraEn) <= ahora || Date.parse(sesion.ultimaActividad) + INACTIVIDAD_MAXIMA <= ahora) return null;
  const cliente = await almacen.clientePorId(notariaId, sesion.clienteId);
  if (!cliente || cliente.estado !== "activa") return null;
  if (ahora - Date.parse(sesion.ultimaActividad) > 3600e3) await almacen.tocarSesionCliente(sesion.id, new Date(ahora).toISOString());
  return { cliente, sesion, tokenHash: huellaSesion(token) };
}

// Contra CSRF: todo POST del portal llega como JSON, con la cabecera X-Sofia y desde el mismo sitio.
export function mismoOrigen(request) {
  if (request.method !== "POST") return true;
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return false;
  if (request.headers.get("x-sofia") !== "1") return false;
  const origen = request.headers.get("origin");
  return !origen || origen === new URL(request.url).origin;
}
