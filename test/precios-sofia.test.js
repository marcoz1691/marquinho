// El guardado del panel llega al costo que usa Sofía al renovar el caché.
import { it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearAsistente } from "../api/_lib/asistente.js";

it("guardarPrecio autorizado actualiza calcular_costo después de cinco minutos", async () => {
  const leer = async (f) => JSON.parse(await readFile(new URL("../data/" + f + ".json", import.meta.url), "utf8"));
  const [tramites, tarifas, notaria] = await Promise.all([leer("tramites"), leer("tarifas"), leer("notaria")]);
  let tiempo = 0;
  const almacen = crearAlmacenMemoria({ personal: [{ email: "admin@ejemplo.ec", rol: "admin" }] });
  const contenido = crearContenido({ almacen, ahora: () => tiempo, leerLocal: async () => ({ tramites, tarifas, notaria }) });
  await contenido();
  const panel = crearPanel({ almacen, contenido });
  const auth = Object.assign(almacen, { usuarioDeToken: async () => ({ email: "admin@ejemplo.ec", email_confirmed_at: "2026-01-01", aal: "aal2" }), esPersonal: async () => true });
  const m = crearManejadorPanel({ panel, auth, exigirMfa: false });
  const r = await m.POST(new Request("https://ejemplo.ec/api/panel", { method: "POST", headers: { Authorization: "Bearer prueba", "Content-Type": "application/json" }, body: JSON.stringify({ accion: "guardarPrecio", tramiteId: "poder-natural", tipo: "fija", valor: 100 }) }));
  expect(r.status).toBe(200);
  tiempo = 300001;
  const guion = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "costo", name: "calcular_costo", input: { tramite_id: "poder-natural" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "El costo es $115,00." }] }
  ];
  const create = vi.fn(async () => guion.shift());
  const asistente = crearAsistente({ almacen, contenido, claude: { beta: { messages: { create } } }, whatsapp: {}, avisar: async () => {}, ahora: () => new Date("2026-10-07T15:00:00Z"), esperar: async () => {} });
  await asistente.atender({ id: "costo-editado", de: "593991112233", nombre: "Ana", tipo: "texto", texto: "Cuánto cuesta un poder" });
  expect(create.mock.calls[1][0].messages.at(-1).content[0].content).toContain("total $115,00");
  expect((await almacen.auditoria())[0]).toMatchObject({ accion: "guardarPrecio", objetivo: "poder-natural", ok: true });
});
