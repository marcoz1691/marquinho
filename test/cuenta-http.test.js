import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearManejadorCuenta } from "../api/_lib/cuenta-http.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearCorreoMemoria } from "../api/_lib/correo.js";
import { emitirVinculo } from "../api/_lib/vinculos.js";

const AHORA = Date.now();
const C = {
  notaria: { nombre: "Notaría 41 de Quito", whatsapp: "593999999999", telefonos: ["02 600 1141"] },
  data: { tramites: [{ id: "poder", nombre: "Poder especial", req: ["Cédula"], pasos: ["Revisión"], tarifa: { tipo: "fija", valor: 10 } }] },
  tarifas: { iva: 0.15, sbu: 482 }
};
const cabeceras = (cookie = "") => ({ "content-type": "application/json", "x-sofia": "1", origin: "https://notaria41.sofiaprefirma.com",
  "x-forwarded-for": "190.1.2.3", ...(cookie ? { cookie } : {}) });
const post = (b, cookie = "", extra = {}) => new Request("https://notaria41.sofiaprefirma.com/api/cuenta", {
  method: "POST", headers: { ...cabeceras(cookie), ...extra }, body: JSON.stringify(b)
});
const get = (accion, cookie = "", otros = {}) => {
  const q = new URLSearchParams({ accion, ...otros });
  return new Request("https://notaria41.sofiaprefirma.com/api/cuenta?" + q, { headers: cookie ? { cookie } : {} });
};

let almacen, correo, api;
beforeEach(async () => {
  almacen = crearAlmacenMemoria();
  correo = crearCorreoMemoria();
  await almacen.guardarAjuste("funcion.portal", "1", "prueba");
  api = crearManejadorCuenta({ almacen, correo, contenido: async () => C, ahora: () => AHORA, secreto: "secreto-de-pruebas-largo-y-unico" });
});

async function entrar(email = "ana@example.test") {
  const pedida = await api.POST(post({ accion: "pedirCodigo", email }));
  expect(pedida.status).toBe(202);
  const codigo = correo.enviados.at(-1).texto.match(/\b\d{6}\b/)[0];
  const verificada = await api.POST(post({ accion: "verificar", email, codigo }));
  expect(verificada.status).toBe(200);
  return { cookie: verificada.headers.get("set-cookie").split(";")[0], cliente: (await verificada.json()).cliente };
}

describe("cuenta del cliente", () => {
  it("entra con código de un solo uso, mantiene respuesta anti-enumeración y cierra la sesión", async () => {
    const primera = await api.POST(post({ accion: "pedirCodigo", email: "ana@example.test" }));
    const mensaje = await primera.json();
    expect(mensaje.mensaje).toMatch(/Si el correo es válido/);
    const repetida = await api.POST(post({ accion: "pedirCodigo", email: "ana@example.test" }));
    expect(await repetida.json()).toEqual(mensaje);
    expect(correo.enviados).toHaveLength(1);
    const codigo = correo.enviados[0].texto.match(/\b\d{6}\b/)[0];
    expect((await api.POST(post({ accion: "verificar", email: "ana@example.test", codigo: "000000" }))).status).toBe(400);
    const r = await api.POST(post({ accion: "verificar", email: "ana@example.test", codigo }));
    const cookie = r.headers.get("set-cookie").split(";")[0];
    expect(cookie).toMatch(/^__Host-sp_sesion=/);
    expect((await api.GET(get("yo", cookie))).status).toBe(200);
    expect((await api.POST(post({ accion: "verificar", email: "ana@example.test", codigo }))).status).toBe(400);
    const salida = await api.POST(post({ accion: "salir" }, cookie));
    expect(salida.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await api.GET(get("yo", cookie))).status).toBe(401);
  });

  it("exige mismo origen, JSON y la cabecera de Sofía en cada POST", async () => {
    expect((await api.POST(post({ accion: "pedirCodigo", email: "ana@example.test" }, "", { origin: "https://malo.test" }))).status).toBe(403);
    const r = new Request("https://notaria41.sofiaprefirma.com/api/cuenta", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect((await api.POST(r)).status).toBe(403);
  });

  it("completa el perfil, vincula el trámite y expone solo datos destinados al cliente", async () => {
    const { cookie, cliente } = await entrar();
    const perfil = await api.POST(post({ accion: "completarPerfil", nombres: "Ana", apellidos: "Pérez", celular: "0991234567",
      aceptaTerminos: true, aceptaPrivacidad: true }, cookie));
    expect(await perfil.json()).toMatchObject({ perfilCompleto: true, cliente: { nombres: "Ana", apellidos: "Pérez", celular: "593991234567" } });

    const conv = await almacen.conversacion("form:593991234567", "Ana Pérez");
    const cita = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-01-10", hora: "09:00", nombre: "Ana Pérez", tramiteId: "poder" });
    const { token } = await emitirVinculo({ almacen, notariaId: "notaria41", solicitudId: cita.id, ahora: AHORA });
    const vinculada = await api.POST(post({ accion: "vincular", token }, cookie));
    expect(await vinculada.json()).toEqual({ id: cita.id });

    const lista = await (await api.GET(get("tramites", cookie, { filtro: "activos" }))).json();
    expect(lista.tramites[0]).toMatchObject({ id: cita.id, nombre: "Poder especial", ticket: expect.stringMatching(/^\d{4}$/), estadoTexto: expect.any(String) });

    const pdf = Buffer.from("%PDF-1.4\nprueba").toString("base64");
    expect((await api.POST(post({ accion: "subirDocumento", id: cita.id, descripcion: "Cédula", nombre: "cedula.pdf", base64: pdf }, cookie))).status).toBe(200);
    const [doc] = await almacen.documentos(conv.id);
    await almacen.revisarDocumento(doc.id, { estado: "observado", nota: "NOTA INTERNA", observacionCliente: "La foto está borrosa." });
    const detalle = await (await api.GET(get("tramite", cookie, { id: cita.id }))).json();
    expect(detalle.tramite).toMatchObject({ requisitos: ["Cédula"], documentos: [{ estado: "observado", observacion: "La foto está borrosa." }] });
    expect(JSON.stringify(detalle)).not.toContain("NOTA INTERNA");
    expect(JSON.stringify(detalle)).not.toContain("conversacionId");
    expect(JSON.stringify(detalle)).not.toContain("clienteId");
  });

  it("no permite ver un trámite ajeno ni usar un ticket como credencial", async () => {
    const { cookie } = await entrar();
    const conv = await almacen.conversacion("form:593991111111", "Otra");
    const cita = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-01-10", hora: "10:00", nombre: "Otra", tramiteId: "poder" });
    expect((await api.GET(get("tramite", cookie, { id: cita.id }))).status).toBe(404);
    expect((await api.POST(post({ accion: "vincular", token: cita.codigo }, cookie))).status).toBe(400);
  });

  it("queda apagada sin el interruptor y no funciona sin correo o secreto", async () => {
    await almacen.guardarAjuste("funcion.portal", "0", "prueba");
    const apagada = await api.GET(get("yo"));
    expect(apagada.status).toBe(503);
    expect(await apagada.json()).toMatchObject({ apagada: true });
    await almacen.guardarAjuste("funcion.portal", "1", "prueba");
    const sinProveedor = crearManejadorCuenta({ almacen, correo: null, contenido: async () => C, secreto: "" });
    expect((await sinProveedor.POST(post({ accion: "pedirCodigo", email: "ana@example.test" }))).status).toBe(503);
  });
});

it("la entrada serverless y Vercel incluyen cuenta y pagos", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  expect(config.functions["api/cuenta.js"]).toEqual({ maxDuration: 30, includeFiles: "data/**" });
  expect(config.functions["api/pagos.js"]).toEqual({ maxDuration: 30, includeFiles: "data/**" });
  expect(config.rewrites).toContainEqual({ source: "/api/pagos-webhook", destination: "/api/pagos?webhook=tramite" });
});
