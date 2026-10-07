import { it, expect, vi, afterEach } from "vitest";
import { crearIcs } from "../js/calendario.js";
import { dimensionesImagen, reducirImagen } from "../js/imagenes.js";
import { enviarMensaje, agregarMensaje, crearChat, chatActual } from "../js/chat-nucleo.js";
const resumen = { codigo: "4821", fecha: "2026-10-08", hora: "23:30", nombre: "Ana", tramite: { nombre: "Poder, general" }, direccion: "Quito; centro\\sur\nPiso 2", requisitos: ["Cédula"] };
afterEach(() => vi.unstubAllGlobals());
it("crea iCalendar con CRLF, zona, UID y una hora incluso al cambiar de día", () => {
  const ics = crearIcs(resumen);
  expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
  expect(ics).toContain("TZID:America/Guayaquil\r\n");
  expect(ics).toContain("DTSTART;TZID=America/Guayaquil:20261008T233000");
  expect(ics).toContain("DTEND;TZID=America/Guayaquil:20261009T003000");
  expect(ics).toContain("UID:4821-20261008@notaria41");
  expect(ics).toContain("DTSTAMP:20261009T043000Z");
  expect(ics).toContain("Poder\\, general");
  expect(ics).toContain("Quito\\; centro\\\\sur\\nPiso 2");
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  expect(ics).toMatch(/END:VCALENDAR\r\n$/);
});
it("pliega líneas a 75 octetos sin romper caracteres UTF-8", () => {
  const ics = crearIcs({ ...resumen, direccion: "á".repeat(120) });
  expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  expect(ics.replace(/\r\n /g, "")).toContain("LOCATION:" + "á".repeat(120));
});
it("limita las imágenes a 1600 px conservando proporciones y sin ampliarlas", () => {
  expect(dimensionesImagen(3200, 2400)).toEqual({ ancho: 1600, alto: 1200 });
  expect(dimensionesImagen(800, 2400)).toEqual({ ancho: 533, alto: 1600 });
  expect(dimensionesImagen(300, 200)).toEqual({ ancho: 300, alto: 200 });
});
it("deja los PDF intactos", async () => {
  const file = { type: "application/pdf" };
  expect(await reducirImagen(file)).toBe(file);
});
it("devuelve las tarjetas del servidor y mantiene compatibilidad sin tarjetas", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ respuestas: ["Listo"], tarjetas: [resumen] }) }));
  expect(await enviarMensaje("s_prueba123456", "cita")).toEqual({ respuestas: ["Listo"], tarjetas: [resumen] });
  fetch.mockResolvedValue({ ok: true, json: async () => ({ respuestas: [] }) });
  expect((await enviarMensaje("s_prueba123456", "hola")).tarjetas).toEqual([]);
});
it("guarda y recupera tarjetas en el historial", () => {
  const datos = new Map();
  vi.stubGlobal("localStorage", { getItem: (k) => datos.get(k) || null, setItem: (k, v) => datos.set(k, v) });
  const c = crearChat();
  agregarMensaje(c.sesion, { autor: "tarjeta", resumen });
  expect(chatActual().mensajes).toEqual([{ autor: "tarjeta", resumen }]);
});

// El resumen llega del servidor: sus campos jamás se interpretan como HTML.
it("escapa los datos de la tarjeta y ofrece los controles de privacidad accesibles", async () => {
  const { htmlCita } = await import("../js/cita-tarjeta.js");
  const html = htmlCita({ ...resumen, codigo: '<img src=x>', requisitos: ['<script>'], costo: { total: '<b>', detalle: 'a & b' }, aviso: '<iframe>', subirDocumentos: true });
  expect(html).not.toMatch(/<img|<script|<iframe/);
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('a &amp; b');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('href="privacidad.html"');
  expect(html).not.toMatch(/\s(?:style|onclick|onsubmit|capture)=/);
});
it("la cita pendiente y sin trámite no muestra costo ni subida si no corresponde", async () => {
  const { htmlCita } = await import("../js/cita-tarjeta.js");
  const html = htmlCita({ ...resumen, estado: "pendiente", tramite: null, costo: null, requisitos: [], subirDocumentos: false });
  expect(html).toContain("El personal la confirmará por WhatsApp.");
  expect(html).not.toContain("Costo referencial");
  expect(html).not.toContain("Subir documentos");
  expect(html).not.toContain("Lleva:");
});
