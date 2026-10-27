import { it, expect, vi } from "vitest";
import { crearAsistente } from "../api/_lib/asistente.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const contenido = {
  data: { categorias: [{ id: "poderes", nombre: "Poderes", resumen: "" }], tramites: [{ id: "poder", cat: "poderes", nombre: "Poder especial", desc: "", req: [], pasos: [], tarifa: { tipo: "pct", valor: 0.12 } }], faq: [], avisos: [] },
  tarifas: { sbu: 482, iva: 0.15, anio: 2026, tablas: {} },
  notaria: { nombre: "Notaría 41 de Quito", notario: "Dr. X", direccion: "Tumbaco", telefonos: ["02 600 1141"], correo: "n@x.ec",
    horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "Lunes a viernes" }, mapa: { lat: 0, lng: 0 }, redes: {}, citas: { porHora: 2, feriados: [] } }
};

async function contextoCon(ajustes) {
  const almacen = crearAlmacenMemoria();
  for (const [k, v] of Object.entries(ajustes)) await almacen.guardarAjuste(k, v, "admin");
  const create = vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: {} }));
  const asistente = crearAsistente({ claude: { beta: { messages: { create } } }, almacen, whatsapp: {}, contenido: async () => contenido, avisar: async () => {}, ahora: () => new Date("2026-10-06T15:00:00Z"), esperar: async () => {} });
  await asistente.atender({ id: "m" + Math.random(), de: "web:s_prueba12345", nombre: "", tipo: "texto", texto: "¿Dónde veo mis trámites?", canal: "web" });
  return create.mock.calls[0][0].messages.at(-1).content;
}

it("con Mis trámites encendido, Sofía sabe cómo crear la cuenta y que el pago es en la notaría", async () => {
  const c = await contextoCon({ "funcion.portal": "1" });
  expect(c).toContain("Mis trámites está disponible");
  expect(c).toContain("/cuenta.html");
  expect(c).toContain("No hay pago en línea por ahora");
});

it("con pagos encendidos ofrece el pago con tarjeta desde Mis trámites", async () => {
  const c = await contextoCon({ "funcion.portal": "1", "funcion.pagosEnLinea": "1" });
  expect(c).toContain("Pago en línea disponible");
});

it("con Mis trámites apagado no ofrece cuentas", async () => {
  const c = await contextoCon({});
  expect(c).toContain("no las ofrezcas");
});
