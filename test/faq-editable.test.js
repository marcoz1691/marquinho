// Preguntas frecuentes editables en el panel: reemplazan a las de la hoja en la web y en Sofía.
import { it, expect } from "vitest";
import { faqValida, aplicarPrecios } from "../js/precios.js";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { crearManejadorPrecios } from "../api/precios.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const HOJA = [{ q: "¿Pregunta de la hoja?", a: "Respuesta de la hoja." }];
const NUEVAS = [{ q: "¿Atienden los sábados?", a: "Pregúntanos por WhatsApp." }, { q: "¿Necesito cita?", a: "No, pero te ahorra tiempo." }];
const pedido = (accion, b = {}) => new Request("https://ejemplo.ec/api/panel", { method: "POST", headers: { Authorization: "Bearer prueba", "Content-Type": "application/json", Origin: "https://ejemplo.ec" }, body: JSON.stringify({ accion, ...b }) });

function montar(rol = "notario") {
  const almacen = crearAlmacenMemoria({ personal: [{ email: "yo@ejemplo.ec", rol }] });
  const base = { tramites: { categorias: [{ id: "c", nombre: "C" }], faq: HOJA, avisos: [], tramites: [{ id: "poder", nombre: "Poder", cat: "c", tarifa: { tipo: "pct", valor: 0.12 } }] }, tarifas: { sbu: 482, iva: 0.15, anio: "2026", tablas: {} }, notaria: {} };
  const contenido = crearContenido({ almacen, leerLocal: async () => structuredClone(base) });
  const panel = crearPanel({ almacen, contenido });
  const auth = Object.assign(almacen, { usuarioDeToken: async () => ({ email: "yo@ejemplo.ec", email_confirmed_at: "2026-01-01", aal: "aal2" }), esPersonal: async () => true });
  return { almacen, contenido, panel, m: crearManejadorPanel({ panel, auth, exigirMfa: false }) };
}

it("valida la lista: limpia espacios y rechaza vacíos, textos cortos o largos y más de 30 preguntas", () => {
  expect(faqValida([{ q: "  ¿Atienden   los sábados? ", a: "Sí.\n Con cita." }])).toEqual([{ q: "¿Atienden los sábados?", a: "Sí. Con cita." }]);
  expect(faqValida(JSON.stringify(NUEVAS))).toEqual(NUEVAS);
  for (const malo of [[], [{ q: "¿Ok?", a: "Respuesta" }], [{ q: "¿Pregunta?", a: "x".repeat(1001) }], [{ q: "¿Pregunta?" }], "no es json", null, Array(31).fill(NUEVAS[0])]) expect(faqValida(malo)).toBeNull();
});

it("el notario guarda las preguntas: las publica /api/precios, llegan al contenido de Sofía y se puede volver a las de la hoja", async () => {
  const { almacen, contenido, panel, m } = montar();
  expect((await panel.precios()).faq).toMatchObject({ valor: HOJA, oficial: HOJA, editada: false });
  expect((await m.POST(pedido("guardarFaq", { preguntas: NUEVAS }))).status).toBe(200);
  expect((await (await crearManejadorPrecios({ almacen })()).json()).faq).toEqual(NUEVAS);
  expect((await contenido()).data.faq).toEqual(NUEVAS);
  expect((await panel.precios()).faq).toMatchObject({ valor: NUEVAS, oficial: HOJA, editada: true, por: "yo@ejemplo.ec" });
  expect((await almacen.auditoria())[0]).toMatchObject({ accion: "guardarFaq", objetivo: "faq", ok: true });
  expect((await m.POST(pedido("restaurarFaq"))).status).toBe(200);
  expect((await contenido()).data.faq).toEqual(HOJA);
  expect("faq" in await (await crearManejadorPrecios({ almacen })()).json()).toBe(false);
});

it("el personal no puede cambiarlas y una lista inválida se rechaza sin tocar la web", async () => {
  const r = await montar("personal").m.POST(pedido("guardarFaq", { preguntas: NUEVAS }));
  expect(r.status).toBe(403);
  const { panel, contenido } = montar();
  await expect(panel.guardarFaq({ preguntas: [{ q: "¿Ok?", a: "" }] }, "a")).rejects.toThrow(/Revisa las preguntas/);
  expect((await contenido()).data.faq).toEqual(HOJA);
});

it("la web aplica las preguntas publicadas y descarta una lista dañada", () => {
  const C = () => ({ data: { tramites: [], faq: HOJA }, tarifas: { tablas: {} }, notaria: {} });
  expect(aplicarPrecios(C(), { faq: NUEVAS }).data.faq).toEqual(NUEVAS);
  expect(aplicarPrecios(C(), { faq: [{ q: "", a: "" }] }).data.faq).toEqual(HOJA);
});
