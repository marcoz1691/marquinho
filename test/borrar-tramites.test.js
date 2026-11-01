// Borrar un trámite desde el panel y dejar en blanco la unidad de un trámite por unidad.
import { it, expect } from "vitest";
import { aplicarPrecios, buscarTramite } from "../js/precios.js";
import { calcularTarifa, calcularConHabilitantes } from "../js/nucleo.js";
import { montoCentavosDe } from "../api/_lib/pagos-http.js";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearPanel } from "../api/_lib/panel.js";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { crearManejadorPrecios } from "../api/precios.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const T = { sbu: 482, iva: 0.15, anio: "2026", tablas: {} };
const copias = (unidad = "por hoja") => ({ id: "copias-certificadas", nombre: "Copias", cat: "c", tarifa: { tipo: "fija", valor: 2, unidad } });
const base = () => ({
  tramites: { categorias: [{ id: "c", nombre: "C" }], faq: [], avisos: [], tramites: [
    { id: "poder", nombre: "Poder", cat: "c", tarifa: { tipo: "pct", valor: 0.12, unidad: "" } }, copias(),
    { id: "firma", nombre: "Firma", cat: "c", tarifa: { tipo: "fija", valor: 10, unidad: "por firma" } }] },
  tarifas: T, notaria: {}
});
const pedido = (accion, b = {}) => new Request("https://ejemplo.ec/api/panel", { method: "POST", headers: { Authorization: "Bearer prueba", "Content-Type": "application/json", Origin: "https://ejemplo.ec" }, body: JSON.stringify({ accion, ...b }) });

function montar(rol = "notario") {
  const almacen = crearAlmacenMemoria({ personal: [{ email: "yo@ejemplo.ec", rol }] });
  const contenido = crearContenido({ almacen, leerLocal: async () => structuredClone(base()) });
  const panel = crearPanel({ almacen, contenido });
  const auth = Object.assign(almacen, { usuarioDeToken: async () => ({ email: "yo@ejemplo.ec", email_confirmed_at: "2026-01-01", aal: "aal2" }), esPersonal: async () => true });
  return { almacen, contenido, panel, m: crearManejadorPanel({ panel, auth, exigirMfa: false }) };
}

it("el notario borra un trámite: sale del contenido y de /api/precios, y se puede restaurar", async () => {
  const { almacen, contenido, panel, m } = montar();
  expect((await m.POST(pedido("borrarTramite", { tramiteId: "poder" }))).status).toBe(200);
  const C = await contenido();
  expect(C.data.tramites.map((t) => t.id)).not.toContain("poder");
  expect((await (await crearManejadorPrecios({ almacen })()).json()).borrados).toEqual(["poder"]);
  expect((await panel.precios()).tramites.find((t) => t.id === "poder")).toMatchObject({ borrado: true, borradoPor: "yo@ejemplo.ec" });
  expect((await almacen.auditoria())[0]).toMatchObject({ accion: "borrarTramite", ok: true });
  expect((await m.POST(pedido("restaurarTramite", { tramiteId: "poder" }))).status).toBe(200);
  expect((await contenido()).data.tramites.map((t) => t.id)).toContain("poder");
  expect("borrados" in await (await crearManejadorPrecios({ almacen })()).json()).toBe(false);
});

it("una cita ya agendada conserva el nombre del trámite borrado", async () => {
  const { contenido, panel } = montar();
  await panel.borrarTramite("poder", "yo@ejemplo.ec");
  expect(buscarTramite(await contenido(), "poder").nombre).toBe("Poder");
  expect(buscarTramite(await contenido(), "no-existe")).toBeUndefined();
});

it("el personal no puede borrar y copias o materializaciones tampoco se borran", async () => {
  const r = await montar("personal").m.POST(pedido("borrarTramite", { tramiteId: "poder" }));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("Solo el notario o un administrador puede editar los trámites.");
  const { panel } = montar();
  await expect(panel.borrarTramite("copias-certificadas", "a")).rejects.toThrow(/habilitantes/);
  await expect(panel.borrarTramite("no-existe", "a")).rejects.toThrow(/no encontrado/i);
  expect((await panel.precios()).tramites.find((t) => t.id === "copias-certificadas").protegido).toBe(true);
});

it("aplicarPrecios acepta los borrados de /api/precios sin tocar lo demás", () => {
  const C = { data: base().tramites, tarifas: T };
  aplicarPrecios(C, { borrados: ["poder"] });
  expect(C.data.tramites.map((t) => t.id)).toEqual(["copias-certificadas", "firma"]);
  expect(C.data.borrados.map((t) => t.id)).toEqual(["poder"]);
});

it("con la unidad en blanco, copias sigue multiplicando y los demás trámites pasan a precio único", () => {
  expect(calcularTarifa(copias(""), T, { cantidad: 200 }).base).toBe(400);
  expect(calcularConHabilitantes({ tarifa: { tipo: "fija", valor: 10, unidad: "" } }, T, {}, { copias: 5 }, [copias("")]).habilitantesBase).toBe(10);
  expect(calcularTarifa({ id: "firma", tarifa: { tipo: "fija", valor: 10, unidad: "" } }, T, { cantidad: 3 }).base).toBe(10);
  expect(montoCentavosDe(copias(""), T)).toBeNull();
});
