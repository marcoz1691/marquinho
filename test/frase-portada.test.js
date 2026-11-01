// Frase grande de la portada: se edita en el panel o en la hoja y la web la muestra.
import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fraseValida, aplicarPrecios } from "../js/precios.js";
import { desdeHoja } from "../js/nucleo.js";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { crearManejadorPrecios } from "../api/precios.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { Aviso } from "../api/_lib/errores.js";

const leer = async (f) => JSON.parse(await readFile(new URL("../data/" + f + ".json", import.meta.url), "utf8"));
const pedido = (accion, b = {}) => new Request("https://ejemplo.ec/api/panel", { method: "POST", headers: { Authorization: "Bearer prueba", "Content-Type": "application/json" }, body: JSON.stringify({ accion, ...b }) });
const FRASE = "Tu trámite, claro desde el primer día.";

async function montar(rol = "notario") {
  const [tramites, tarifas, notaria] = await Promise.all([leer("tramites"), leer("tarifas"), leer("notaria")]);
  const almacen = crearAlmacenMemoria({ personal: [{ email: "yo@ejemplo.ec", rol }] });
  const contenido = crearContenido({ almacen, leerLocal: async () => ({ tramites, tarifas, notaria }) });
  const panel = crearPanel({ almacen, contenido });
  const auth = Object.assign(almacen, { usuarioDeToken: async () => ({ email: "yo@ejemplo.ec", email_confirmed_at: "2026-01-01", aal: "aal2" }), esPersonal: async () => true, rolDe: async () => rol });
  return { almacen, panel, notaria, m: crearManejadorPanel({ panel, auth, exigirMfa: false }) };
}

it("fraseValida junta espacios y descarta frases vacías, cortas, largas o que no son texto", () => {
  expect(fraseValida("  Cada trámite,\n explicado.  ")).toBe("Cada trámite, explicado.");
  for (const v of ["", "Corta", "x".repeat(201), null, 42, ["Cada trámite, explicado."]]) expect(fraseValida(v)).toBeNull();
});

it("aplicarPrecios pone la frase editada y deja la de la hoja si la guardada no sirve", () => {
  const base = () => ({ data: { tramites: [] }, tarifas: {}, notaria: { frasePortada: "La frase de la hoja." } });
  expect(aplicarPrecios(base(), { frasePortada: FRASE }).notaria.frasePortada).toBe(FRASE);
  expect(aplicarPrecios(base(), { frasePortada: "x" }).notaria.frasePortada).toBe("La frase de la hoja.");
});

it("la hoja puede cambiar la frase en «Configuración» con el dato «Frase de portada»", async () => {
  const [tramites, tarifas, notaria] = await Promise.all([leer("tramites"), leer("tarifas"), leer("notaria")]);
  const tabs = { categorias: "Código,Nombre\npoderes,Poderes\n", tramites: "Código,Trámite,Categoría,Tipo,Valor\npoder,Poder,poderes,Consultar,\n", configuracion: `Dato,Valor\nFrase de portada,"${FRASE}"\n` };
  expect(desdeHoja(tabs, { data: tramites, tarifas, notaria }).notaria.frasePortada).toBe(FRASE);
});

it("el notario guarda la frase: la publica /api/precios, el panel la muestra y se puede volver a la de la hoja", async () => {
  const { almacen, panel, notaria, m } = await montar("notario");
  expect((await panel.precios()).frasePortada).toMatchObject({ valor: notaria.frasePortada, editada: false });
  expect((await m.POST(pedido("guardarFrase", { frase: FRASE }))).status).toBe(200);
  expect((await (await crearManejadorPrecios({ almacen })()).json()).frasePortada).toBe(FRASE);
  expect((await panel.precios()).frasePortada).toMatchObject({ valor: FRASE, oficial: notaria.frasePortada, editada: true, por: "yo@ejemplo.ec" });
  expect((await almacen.auditoria())[0]).toMatchObject({ accion: "guardarFrase", objetivo: "portada.frase", ok: true });
  expect((await m.POST(pedido("restaurarFrase"))).status).toBe(200);
  expect((await panel.precios()).frasePortada.editada).toBe(false);
  expect("frasePortada" in await (await crearManejadorPrecios({ almacen })()).json()).toBe(false);
});

it("el personal no puede cambiar la frase y una frase inválida se rechaza", async () => {
  const personal = await montar("personal");
  const r = await personal.m.POST(pedido("guardarFrase", { frase: FRASE }));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("Solo el notario o un administrador puede editar los trámites.");
  const { panel } = await montar("admin");
  await expect(panel.guardarFrase({ frase: "Corta" }, "yo@ejemplo.ec")).rejects.toBeInstanceOf(Aviso);
});
