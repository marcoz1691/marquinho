import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { crearManejadorDocumentos } from "../api/_lib/documentos-http.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { AVISO_PRIVACIDAD } from "../api/_lib/privacidad.js";

const SESION = "s_7f3a9c2e41b84d0f", OTRA = "s_otra9c2e41b84d0f";
const AHORA = Date.parse("2026-10-08T02:00:00Z"); // En Quito aún es 7 de octubre.
const PDF = Buffer.from("%PDF-1.7").toString("base64");
const cuerpo = { sesion: SESION, ticket: "4821", descripcion: " Cédula del vendedor ", nombre: "cedula.pdf", base64: PDF, aceptaAviso: true };
const pedir = (b = cuerpo, ip = "190.152.10.20") => new Request("https://notaria41.vercel.app/api/documentos", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip + ", 10.0.0.1" }, body: typeof b === "string" ? b : JSON.stringify(b)
});
const leer = (sesion = SESION, ticket = "4821") => new Request(`https://notaria41.vercel.app/api/documentos?sesion=${sesion}&ticket=${ticket}`);
async function preparar(opciones = {}) {
  const almacen = crearAlmacenMemoria(), avisar = vi.fn(async () => {});
  const conv = await almacen.conversacion("web:" + SESION, "Ana Pérez");
  // El almacén genera el ticket al crear la cita; aquí se fija uno conocido para poder escribir el pedido.
  const cita = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-07", nombre: "Ana Pérez", tramiteId: "poder-natural" });
  await almacen.actualizarCita(cita.id, { codigo: "4821", ...opciones.cita });
  const m = crearManejadorDocumentos({ almacen, avisar, ahora: () => AHORA, limites: opciones.limites });
  return { almacen, avisar, conv, cita, m };
}

describe("API de documentos web", () => {
  it.each(["no es json", null, { ...cuerpo, sesion: "x" }, { ...cuerpo, sesion: "a".repeat(65) }, { ...cuerpo, sesion: "a".repeat(11) }, { ...cuerpo, sesion: "sesion/incorrecta" }])("rechaza JSON o sesión inválida: %j", async (b) => {
    const { m } = await preparar();
    expect((await m.POST(pedir(b))).status).toBe(400);
  });
  it.each([false, undefined, "true", 1])("exige consentimiento explícito: %j", async (aceptaAviso) => {
    const { m } = await preparar();
    const r = await m.POST(pedir({ ...cuerpo, aceptaAviso }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Acepta el aviso de privacidad para enviar documentos." });
  });
  it.each([" ", "a", "a".repeat(121), null, 42])("rechaza descripción inválida: %j", async (descripcion) => {
    const { m, almacen } = await preparar();
    const uso = vi.spyOn(almacen, "contarUso");
    expect((await m.POST(pedir({ ...cuerpo, descripcion }))).status).toBe(400);
    expect(uso).not.toHaveBeenCalled();
  });
  it("guarda bytes, nombre limpio, consentimiento y aviso; GET muestra solo los campos públicos", async () => {
    const { m, almacen, conv, avisar } = await preparar();
    const r = await m.POST(pedir({ ...cuerpo, nombre: '<>/' + "a".repeat(130) }));
    expect(r.status).toBe(200);
    const documentos = [{ descripcion: "Cédula del vendedor", estado: "recibido", nombre: "a".repeat(120) }];
    expect(await r.json()).toEqual({ ok: true, documentos });
    const [doc] = await almacen.documentos(conv.id);
    expect(doc).toMatchObject({ conversacionId: conv.id, mime: "application/pdf", tramiteId: "poder-natural" });
    expect(doc.mediaId).toMatch(/^web-[0-9a-f-]{36}$/);
    expect(Buffer.from(doc.bytes)).toEqual(Buffer.from("%PDF-1.7"));
    expect(await almacen.conversacionPorId(conv.id)).toMatchObject({ consentimiento: true, consentimientoEn: new Date(AHORA).toISOString(), consentimientoTexto: "Casilla del aviso de privacidad en la web (ticket 4821)", consentimientoAviso: "2026-10-07" });
    expect(avisar).toHaveBeenCalledWith("Documento recibido en la web (ticket 4821, Ana Pérez): Cédula del vendedor. Revísalo en el panel.");
    const get = await m.GET(leer());
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ documentos });
    expect(get.headers.get("Cache-Control")).toBe("no-store");
  });
  it("conserva la evidencia anterior y devuelve todos los documentos", async () => {
    const { m, almacen, conv } = await preparar();
    await almacen.actualizarConversacion(conv.id, { consentimiento: true, consentimientoEn: "antes", consentimientoTexto: "anterior", consentimientoAviso: "v1" });
    await m.POST(pedir());
    const r = await m.POST(pedir());
    expect((await r.json()).documentos).toHaveLength(2);
    expect(await almacen.conversacionPorId(conv.id)).toMatchObject({ consentimientoEn: "antes", consentimientoTexto: "anterior", consentimientoAviso: "v1" });
  });
  it("no crea conversaciones al recibir o listar una sesión desconocida", async () => {
    const { m, almacen } = await preparar();
    const buscar = vi.spyOn(almacen, "conversacion");
    expect((await m.POST(pedir({ ...cuerpo, sesion: OTRA }))).status).toBe(404);
    expect((await m.GET(leer(OTRA))).status).toBe(404);
    expect(buscar).not.toHaveBeenCalled();
    expect(await almacen.conversaciones()).toHaveLength(1);
  });
  it("aísla documentos entre sesiones y no acepta un ticket de otro cliente", async () => {
    const { m, almacen } = await preparar();
    const otra = await almacen.conversacion("web:" + OTRA);
    const ajena = await almacen.crearSolicitudCita({ conversacionId: otra.id, fecha: "2026-10-09" });
    await almacen.actualizarCita(ajena.id, { codigo: "1234" });
    await m.POST(pedir());
    expect(await (await m.GET(leer(OTRA, "1234"))).json()).toEqual({ documentos: [] });
    expect((await m.GET(leer(OTRA))).status).toBe(404);
    expect((await m.POST(pedir({ ...cuerpo, sesion: OTRA }))).status).toBe(404);
  });
  it.each([{ codigo: null }, { fecha: "2026-10-06" }, { estado: "rechazada" }, { estado: "cancelada" }])("rechaza una cita no vigente: %j", async (cita) => {
    const { m } = await preparar({ cita });
    for (const r of [await m.POST(pedir()), await m.GET(leer())]) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "No encuentro tu cita" });
    }
  });
  it("GET rechaza una sesión inválida sin gastar cuota y un ticket mal formado con 404", async () => {
    const { m, almacen } = await preparar();
    const uso = vi.spyOn(almacen, "contarUso");
    expect((await m.GET(leer("x"))).status).toBe(400);
    expect(uso).not.toHaveBeenCalled();
    for (const ticket of ["", "482", "48210", "abcd"]) expect((await m.GET(leer(SESION, ticket))).status).toBe(404);
  });
  it.each(["", "%%%", "JVBERi0*", "JVBERi0===", 42])("rechaza base64 inválido: %j", async (base64) => {
    const { m } = await preparar();
    expect((await m.POST(pedir({ ...cuerpo, base64 }))).status).toBe(400);
  });
  // Vercel rechaza pedidos de más de 4,5 MB: 3 MB en bytes son 4 MB en base64, que caben con el resto del JSON.
  it("rechaza más de 3 MB y acepta exactamente 3 MB", async () => {
    const { m } = await preparar();
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 1); bytes.write("%PDF-");
    const r = await m.POST(pedir({ ...cuerpo, base64: bytes.toString("base64") }));
    expect(r.status).toBe(413);
    expect((await r.json()).error).toMatch(/El archivo pesa más de 3 MB/);
    expect((await m.POST(pedir({ ...cuerpo, base64: bytes.subarray(0, -1).toString("base64") }))).status).toBe(200);
  });
  it("busca la conversación por su teléfono sin recorrer ni crear conversaciones", async () => {
    const { m, almacen } = await preparar();
    const todas = vi.spyOn(almacen, "conversaciones"), crear = vi.spyOn(almacen, "conversacion");
    expect((await m.GET(leer())).status).toBe(200);
    expect((await m.GET(leer("s_inexistente0001"))).status).toBe(404);
    expect(todas).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });
  it("limita las consultas (GET) por IP para que no se use como buscador de tickets", async () => {
    const { m } = await preparar({ limites: { porSesion: 20, porIp: 40, consultasPorIp: 3 } });
    for (let i = 0; i < 3; i++) expect((await m.GET(leer(SESION, "9999"))).status).toBe(404);
    expect((await m.GET(leer())).status).toBe(429);
  });
  it("guarda la versión vigente del aviso de privacidad como evidencia", async () => {
    const { m, almacen, conv } = await preparar();
    await m.POST(pedir());
    expect((await almacen.conversacionPorId(conv.id)).consentimientoAviso).toBe(AVISO_PRIVACIDAD);
  });
  it("rechaza el tipo real no permitido aunque el nombre diga PDF", async () => {
    const { m, almacen, conv, avisar } = await preparar();
    expect((await m.POST(pedir({ ...cuerpo, base64: Buffer.from("<html>").toString("base64") }))).status).toBe(415);
    expect(await almacen.documentos(conv.id)).toEqual([]);
    expect((await almacen.conversacionPorId(conv.id)).consentimiento).toBe(false);
    expect(avisar).not.toHaveBeenCalled();
  });
  it.each([{ bytes: [255, 216, 255] }, { bytes: [137, 80, 78, 71, 13, 10, 26, 10] }, { bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80] }])("acepta imágenes por bytes: %j", async ({ bytes }) => {
    const { m } = await preparar({ cita: { estado: "confirmada" } });
    expect((await m.POST(pedir({ ...cuerpo, base64: Buffer.from(bytes).toString("base64") }))).status).toBe(200);
  });
  it("rechaza el documento 21 con 409 después de validar el tipo", async () => {
    const { m, almacen, conv } = await preparar();
    for (let i = 0; i < 20; i++) await almacen.guardarDocumento({ conversacionId: conv.id });
    expect((await m.POST(pedir({ ...cuerpo, base64: Buffer.from("texto").toString("base64") }))).status).toBe(415);
    expect((await m.POST(pedir())).status).toBe(409);
    expect(await almacen.documentos(conv.id)).toHaveLength(20);
  });
  it("limita a 20 por sesión por hora y renueva la cuota", async () => {
    const { almacen, avisar } = await preparar();
    let t = AHORA;
    const m = crearManejadorDocumentos({ almacen, avisar, ahora: () => t });
    for (let i = 0; i < 20; i++) expect((await m.POST(pedir({ ...cuerpo, ticket: "0000" }))).status).toBe(404);
    expect((await m.POST(pedir())).status).toBe(429);
    t += 3600000;
    expect((await m.POST(pedir())).status).toBe(200);
  });
  it("limita a 40 por IP entre sesiones y guarda solo la huella", async () => {
    const { m, almacen } = await preparar();
    const uso = vi.spyOn(almacen, "contarUso");
    for (let i = 0; i < 40; i++) expect((await m.POST(pedir({ ...cuerpo, sesion: SESION + i }))).status).toBe(404);
    expect((await m.POST(pedir())).status).toBe(429);
    const huella = createHash("sha256").update("notaria41:190.152.10.20").digest("hex").slice(0, 24);
    expect(uso).toHaveBeenCalledWith("documentos:ip:" + huella, 3600000, AHORA);
    expect(JSON.stringify(uso.mock.calls)).not.toContain("190.152.10.20");
  });
  it("respeta el orden: consentimiento, descripción, cuota, cita, base64", async () => {
    const { m } = await preparar({ limites: { porSesion: 0, porIp: 0 } });
    expect((await m.POST(pedir({ ...cuerpo, aceptaAviso: false, descripcion: "", base64: "?" }))).status).toBe(400);
    expect((await m.POST(pedir({ ...cuerpo, descripcion: "", base64: "?" }))).status).toBe(400);
    expect((await m.POST(pedir({ ...cuerpo, ticket: "0000", base64: "?" }))).status).toBe(429);
    const normal = await preparar();
    expect((await normal.m.POST(pedir({ ...cuerpo, ticket: "0000", base64: "?" }))).status).toBe(404);
  });
});

describe("Entrada serverless de documentos", () => {
  it("conecta POST y GET con el almacén y el aviso al personal", async () => {
    const { almacen, avisar } = await preparar();
    vi.doMock("../api/_lib/servicios.js", () => ({ obtenerServicios: () => ({ almacen, avisar }) }));
    try {
      const { POST, GET } = await import("../api/documentos.js");
      // La cita de esta prueba debe seguir vigente con el reloj real del endpoint.
      const [conv] = await almacen.conversaciones();
      const [cita] = await almacen.solicitudesCita(conv.id);
      await almacen.actualizarCita(cita.id, { fecha: "2099-12-31" });
      expect((await POST(pedir())).status).toBe(200);
      expect(avisar).toHaveBeenCalledOnce();
      expect((await (await GET(leer())).json()).documentos).toHaveLength(1);
    } finally { vi.doUnmock("../api/_lib/servicios.js"); }
  });
  it("configura duración y datos incluidos en Vercel", async () => {
    const { readFile } = await import("node:fs/promises");
    const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
    expect(config.functions["api/documentos.js"]).toEqual({ maxDuration: 30, includeFiles: "data/**" });
  });
});
