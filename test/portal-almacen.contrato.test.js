// Contrato del almacén del portal de clientes: memoria y Supabase deben comportarse igual.
// Supabase solo corre con SUPABASE_URL_PRUEBA y SUPABASE_KEY_PRUEBA (un proyecto de pruebas, nunca producción).
import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearAlmacenSupabase } from "../api/_lib/almacen-supabase.js";

const adaptadores = [["memoria", () => crearAlmacenMemoria()]];
if (process.env.SUPABASE_URL_PRUEBA && process.env.SUPABASE_KEY_PRUEBA) {
  adaptadores.push(["supabase", () => crearAlmacenSupabase({ url: process.env.SUPABASE_URL_PRUEBA, clave: process.env.SUPABASE_KEY_PRUEBA })]);
}
const N = "notaria41", HORA = 3600e3;
const unico = () => Date.now() + "-" + Math.random().toString(36).slice(2);
const futuro = (ms = HORA) => new Date(Date.now() + ms).toISOString();
const pasado = () => new Date(Date.now() - HORA).toISOString();

async function tramite(a, { notariaId } = {}) {
  const conv = await a.conversacion("form:5939" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"), "Ana");
  const { id, codigo } = await a.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-03-0" + (1 + Math.floor(Math.random() * 8)), hora: "09:00", nombre: "Ana", ...(notariaId ? { notariaId } : {}) });
  return { conv, id, codigo };
}

describe.each(adaptadores)("portal %s", (_, crear) => {
  it("exige la notaría en cada método", async () => {
    const a = crear();
    await expect(a.clientePorEmail(undefined, "x@example.test")).rejects.toThrow(/notaría/);
    await expect(a.tramitesDeCliente("", "id")).rejects.toThrow(/notaría/);
  });

  it("código de un solo uso: falla, acierta una vez, el nuevo anula al anterior y se quema al quinto intento", async () => {
    const a = crear(), destino = "d-" + unico();
    await a.crearCodigoCliente({ notariaId: N, destinoHuella: destino, codigoHmac: "viejo", expiraEn: futuro() });
    await a.crearCodigoCliente({ notariaId: N, destinoHuella: destino, codigoHmac: "bueno", expiraEn: futuro() });
    expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: destino, codigoHmac: "viejo" })).toBe(false);
    expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: destino, codigoHmac: "bueno" })).toBe(true);
    expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: destino, codigoHmac: "bueno" })).toBe(false);
    const otro = "d-" + unico();
    await a.crearCodigoCliente({ notariaId: N, destinoHuella: otro, codigoHmac: "bueno", expiraEn: futuro() });
    for (let i = 0; i < 5; i++) expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: otro, codigoHmac: "malo" })).toBe(false);
    expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: otro, codigoHmac: "bueno" })).toBe(false);
    const vencido = "d-" + unico();
    await a.crearCodigoCliente({ notariaId: N, destinoHuella: vencido, codigoHmac: "bueno", expiraEn: pasado() });
    expect(await a.consumirCodigoCliente({ notariaId: N, destinoHuella: vencido, codigoHmac: "bueno" })).toBe(false);
    expect(await a.consumirCodigoCliente({ notariaId: "notaria-b", destinoHuella: destino, codigoHmac: "bueno" })).toBe(false);
    expect(await a.ultimoCodigoCliente({ notariaId: N, destinoHuella: destino })).toMatchObject({ creado: expect.any(String) });
  });

  it("clientes por notaría: correo único en minúsculas, actualización solo de campos permitidos", async () => {
    const a = crear(), email = `Ana-${unico()}@Example.test`;
    const c = await a.crearCliente({ notariaId: N, email, emailVerificadoEn: new Date().toISOString() });
    expect(c).toMatchObject({ email: email.toLowerCase(), estado: "activa", avisosCorreo: true, avisosWhatsapp: false });
    await expect(a.crearCliente({ notariaId: N, email, emailVerificadoEn: new Date().toISOString() })).rejects.toThrow();
    await a.actualizarCliente(N, c.id, { nombres: "Ana", apellidos: "Pérez", celular: "593991112233", rol: "admin", email: "otro@example.test" });
    const leido = await a.clientePorEmail(N, email);
    expect(leido).toMatchObject({ nombres: "Ana", apellidos: "Pérez", celular: "593991112233", email: email.toLowerCase() });
    expect(leido).not.toHaveProperty("rol");
    expect(await a.clientePorEmail("notaria-b", email)).toBeNull();
    expect(await a.clientePorId("notaria-b", c.id)).toBeNull();
  });

  it("sesiones: se guarda la huella, se revoca una o todas", async () => {
    const a = crear();
    const c = await a.crearCliente({ notariaId: N, email: `s-${unico()}@example.test`, emailVerificadoEn: new Date().toISOString() });
    const h1 = "h1-" + unico(), h2 = "h2-" + unico();
    await a.crearSesionCliente({ notariaId: N, clienteId: c.id, tokenHash: h1, expiraEn: futuro(30 * 864e5) });
    await a.crearSesionCliente({ notariaId: N, clienteId: c.id, tokenHash: h2, expiraEn: futuro(30 * 864e5) });
    expect(await a.sesionCliente(h1)).toMatchObject({ clienteId: c.id, notariaId: N, revocadaEn: null });
    await a.revocarSesionCliente(h1);
    expect((await a.sesionCliente(h1)).revocadaEn).toBeTruthy();
    expect((await a.sesionCliente(h2)).revocadaEn).toBeNull();
    await a.revocarSesionesCliente(N, c.id);
    expect((await a.sesionCliente(h2)).revocadaEn).toBeTruthy();
    expect(await a.sesionCliente("no-existe")).toBeNull();
  });

  it("vinculación: un solo uso, nunca roba un trámite ajeno ni cruza notarías, y el trámite no expone la nota interna", async () => {
    const a = crear();
    const ana = await a.crearCliente({ notariaId: N, email: `ana-${unico()}@example.test`, emailVerificadoEn: new Date().toISOString() });
    const beto = await a.crearCliente({ notariaId: N, email: `beto-${unico()}@example.test`, emailVerificadoEn: new Date().toISOString() });
    const t = await tramite(a);
    const tk = (s) => s + "-" + unico();
    const [t1, t2, t3, t4] = [tk("t1"), tk("t2"), tk("t3"), tk("t4")];
    for (const h of [t1, t2]) await a.crearVinculacion({ notariaId: N, solicitudId: t.id, tokenHash: h, canal: "creacion", expiraEn: futuro() });
    await a.crearVinculacion({ notariaId: N, solicitudId: t.id, tokenHash: t3, canal: "whatsapp", expiraEn: pasado() });
    await a.crearVinculacion({ notariaId: N, solicitudId: t.id, tokenHash: t4, canal: "creacion", expiraEn: futuro() });
    expect(await a.consumirVinculacion({ notariaId: N, tokenHash: t1, clienteId: ana.id })).toBe(t.id);
    expect(await a.consumirVinculacion({ notariaId: N, tokenHash: t1, clienteId: ana.id })).toBeNull();
    expect(await a.consumirVinculacion({ notariaId: N, tokenHash: t2, clienteId: beto.id })).toBeNull();
    expect(await a.consumirVinculacion({ notariaId: N, tokenHash: t3, clienteId: ana.id })).toBeNull();
    expect(await a.consumirVinculacion({ notariaId: "notaria-b", tokenHash: t4, clienteId: ana.id })).toBeNull();

    await a.guardarDocumento({ conversacionId: t.conv.id, mediaId: "m-" + unico(), nombre: "cedula.pdf", mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]), descripcion: "Cédula", solicitudId: t.id });
    const [doc] = await a.documentos(t.conv.id);
    await a.revisarDocumento(doc.id, { estado: "observado", nota: "INTERNA: no mostrar", observacionCliente: "La foto está borrosa" });
    await a.registrarEventoTramite({ notariaId: N, solicitudId: t.id, tipo: "documento_observado", textoCliente: "Revisa tu cédula", actor: "personal" });
    await a.registrarEventoTramite({ notariaId: N, solicitudId: t.id, tipo: "confirmada", visibleCliente: false, actor: "personal" });

    const lista = await a.tramitesDeCliente(N, ana.id);
    expect(lista.map((x) => x.id)).toEqual([t.id]);
    expect(await a.tramitesDeCliente(N, beto.id)).toEqual([]);
    expect(await a.tramiteDeCliente(N, beto.id, t.id)).toBeNull();
    expect(await a.tramiteDeCliente("notaria-b", ana.id, t.id)).toBeNull();
    const detalle = await a.tramiteDeCliente(N, ana.id, t.id);
    expect(detalle.documentos).toEqual([expect.objectContaining({ descripcion: "Cédula", estado: "observado", observacion: "La foto está borrosa" })]);
    expect(JSON.stringify(detalle)).not.toContain("INTERNA");
    expect(detalle.documentos[0]).not.toHaveProperty("id");
    expect(detalle.eventos.map((e) => e.tipo)).toEqual(["documento_observado"]);

    expect(await a.clientesPanel(N, { ticket: t.codigo })).toEqual([expect.objectContaining({ id: ana.id })]);
    expect(await a.clientesPanel("notaria-b", { email: ana.email })).toEqual([]);
    await a.desvincularTramite(N, t.id);
    expect(await a.tramitesDeCliente(N, ana.id)).toEqual([]);
  });

  it("pagos: idempotentes, transiciones condicionadas al estado y eventos sin duplicar", async () => {
    const a = crear(), idem = "i-" + unico();
    const p = await a.crearPago({ notariaId: N, concepto: "Poder especial", montoCentavos: 6652, proveedor: "falso", idempotencia: idem });
    expect(p).toMatchObject({ estado: "creado", montoCentavos: 6652, moneda: "USD" });
    expect(await a.crearPago({ notariaId: N, concepto: "Otro", montoCentavos: 1, proveedor: "falso", idempotencia: idem })).toMatchObject({ id: p.id, existente: true });
    const orden = "o-" + unico();
    await a.fijarOrdenPago(p.id, orden);
    expect((await a.pagoPorOrden("falso", orden)).id).toBe(p.id);
    expect(await a.transicionarPago(p.id, "creado", "pendiente")).toBe(true);
    expect(await a.transicionarPago(p.id, "creado", "pendiente")).toBe(false);
    expect(await a.pagoPorId("notaria-b", p.id)).toBeNull();
    const ev = { pagoId: p.id, proveedor: "falso", eventoProveedorId: "e-" + unico(), firmaValida: true, resultado: "aplicado" };
    expect(await a.registrarEventoPago(ev)).toEqual({ duplicado: false });
    expect(await a.registrarEventoPago(ev)).toEqual({ duplicado: true });
  });
});

it("cuentas sin uso por 24 meses se eliminan y sus trámites quedan sin dueño (memoria)", async () => {
  const a = crearAlmacenMemoria();
  const c = await a.crearCliente({ notariaId: N, email: "vieja@example.test", emailVerificadoEn: new Date().toISOString() });
  await a.actualizarCliente(N, c.id, { ultimoAcceso: new Date(Date.now() - 800 * 864e5).toISOString() });
  const t = await tramite(a);
  await a.crearVinculacion({ notariaId: N, solicitudId: t.id, tokenHash: "x", canal: "creacion", expiraEn: futuro() });
  await a.consumirVinculacion({ notariaId: N, tokenHash: "x", clienteId: c.id });
  expect(await a.purgarPortal()).toEqual({ clientes: 1 });
  expect(await a.clientePorId(N, c.id)).toBeNull();
  expect((await a.cita(t.id)).clienteId).toBeNull();
});
