// Textos de trámites editados en el panel: validación, publicación y llegada a la web y a Sofía.
import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { textoValido, textosDeAjustes, aplicarPrecios } from "../js/precios.js";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { crearManejadorPrecios } from "../api/precios.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { Aviso } from "../api/_lib/errores.js";

const leer = async (f) => JSON.parse(await readFile(new URL("../data/" + f + ".json", import.meta.url), "utf8"));
const pedido = (accion, b = {}) => new Request("https://ejemplo.ec/api/panel", { method: "POST", headers: { Authorization: "Bearer prueba", "Content-Type": "application/json" }, body: JSON.stringify({ accion, ...b }) });
const texto = { nombre: "Poder general o especial", desc: "Para que alguien firme por ti.", req: ["Minuta firmada por un abogado", "Cédula del poderdante"], pasos: ["Trae la minuta", "Firma ante el notario"], nota: "" };

async function montar(rol = "admin") {
  const [tramites, tarifas, notaria] = await Promise.all([leer("tramites"), leer("tarifas"), leer("notaria")]);
  let tiempo = 0;
  const almacen = crearAlmacenMemoria({ personal: [{ email: "yo@ejemplo.ec", rol }] });
  const contenido = crearContenido({ almacen, ahora: () => tiempo, leerLocal: async () => ({ tramites, tarifas, notaria }) });
  const panel = crearPanel({ almacen, contenido });
  const auth = Object.assign(almacen, { usuarioDeToken: async () => ({ email: "yo@ejemplo.ec", email_confirmed_at: "2026-01-01", aal: "aal2" }), esPersonal: async () => true, rolDe: async () => rol });
  return { almacen, contenido, panel, m: crearManejadorPanel({ panel, auth, exigirMfa: false }), pasar: (ms) => { tiempo += ms; } };
}

it("textoValido limpia espacios y descarta textos vacíos, largos o con otra forma", () => {
  expect(textoValido({ ...texto, nombre: "  Poder  ", req: [" Cédula ", ""] })).toMatchObject({ nombre: "Poder", req: ["Cédula"] });
  expect(textoValido({ ...texto, nombre: "Po" })).toBeNull();
  expect(textoValido({ ...texto, desc: "x".repeat(501) })).toBeNull();
  expect(textoValido({ ...texto, req: "Cédula" })).toBeNull();
  expect(textoValido({ ...texto, pasos: Array(26).fill("Paso") })).toBeNull();
  expect(textoValido(null)).toBeNull();
});

it("aplicarPrecios usa el texto editado y conserva la tarifa; un texto dañado deja el de la hoja", async () => {
  const [tramites, tarifas] = await Promise.all([leer("tramites"), leer("tarifas")]);
  const C = aplicarPrecios({ data: structuredClone(tramites), tarifas }, { textos: { "poder-natural": texto, "copias": { nombre: "" } } });
  const poder = C.data.tramites.find((t) => t.id === "poder-natural");
  expect(poder).toMatchObject({ nombre: texto.nombre, req: texto.req, tarifa: tramites.tramites.find((t) => t.id === "poder-natural").tarifa });
  expect(C.data.tramites.find((t) => t.id === "copias")?.nombre).toBe(tramites.tramites.find((t) => t.id === "copias")?.nombre);
  expect(textosDeAjustes({ "tramite.a": JSON.stringify(texto), "tramite.b": "{dañado", sbu: 482 })).toEqual({ a: texto });
});

it("el notario guarda un texto: lo publican /api/precios y Sofía, y se puede volver al de la hoja", async () => {
  const { almacen, contenido, panel, m, pasar } = await montar("notario");
  await contenido();
  expect((await m.POST(pedido("guardarTexto", { tramiteId: "poder-natural", ...texto }))).status).toBe(200);
  const publico = await (await crearManejadorPrecios({ almacen })()).json();
  expect(publico.textos["poder-natural"]).toEqual(texto);
  pasar(300001);
  expect((await contenido()).data.tramites.find((t) => t.id === "poder-natural").nombre).toBe(texto.nombre);
  const enPanel = (await panel.precios()).tramites.find((t) => t.id === "poder-natural");
  expect(enPanel).toMatchObject({ nombre: texto.nombre, textoEditado: true, textoPor: "yo@ejemplo.ec" });
  expect(enPanel.oficial.nombre).not.toBe(texto.nombre);
  expect((await almacen.auditoria())[0]).toMatchObject({ accion: "guardarTexto", objetivo: "poder-natural", ok: true });
  expect((await m.POST(pedido("restaurarTexto", { tramiteId: "poder-natural" }))).status).toBe(200);
  expect((await panel.precios()).tramites.find((t) => t.id === "poder-natural").textoEditado).toBe(false);
});

it("el personal no puede editar textos y un trámite inexistente o un texto inválido se rechazan", async () => {
  const personal = await montar("personal");
  const r = await personal.m.POST(pedido("guardarTexto", { tramiteId: "poder-natural", ...texto }));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("Solo el notario o un administrador puede editar los trámites.");
  const { panel } = await montar("admin");
  await expect(panel.guardarTexto({ tramiteId: "no-existe", ...texto }, "yo@ejemplo.ec")).rejects.toBeInstanceOf(Aviso);
  await expect(panel.guardarTexto({ tramiteId: "poder-natural", ...texto, nombre: "" }, "yo@ejemplo.ec")).rejects.toBeInstanceOf(Aviso);
});
