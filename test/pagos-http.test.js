import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearManejadorPagos, montoCentavosDe } from "../api/_lib/pagos-http.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { abrirSesion } from "../api/_lib/sesion-cliente.js";
import { emitirVinculo, consumirVinculo } from "../api/_lib/vinculos.js";
import { crearProveedorFalso } from "../api/_lib/pagos/proveedor-falso.js";
import { puedePasar, obtenerProveedorPagos } from "../api/_lib/pagos/proveedor.js";

const N = "notaria41";
const C = {
  data: { tramites: [
    { id: "poder", nombre: "Poder especial", tarifa: { tipo: "fija", valor: 10 } },
    { id: "por-hoja", nombre: "Copias", tarifa: { tipo: "fija", valor: 2, unidad: "por hoja" } },
    { id: "caso", nombre: "Transferencia", tarifa: { tipo: "consultar" } }
  ] },
  tarifas: { iva: 0.15, sbu: 482 }
};
const post = (b, cookie = "") => new Request("https://notaria41.sofiaprefirma.com/api/pagos", { method: "POST", headers: {
  "content-type": "application/json", "x-sofia": "1", origin: "https://notaria41.sofiaprefirma.com", ...(cookie ? { cookie } : {})
}, body: JSON.stringify(b) });

let almacen, proveedor, api, cookie, cita;
beforeEach(async () => {
  almacen = crearAlmacenMemoria();
  await almacen.guardarAjuste("funcion.portal", "1", "prueba");
  await almacen.guardarAjuste("funcion.pagosEnLinea", "1", "prueba");
  const cliente = await almacen.crearCliente({ notariaId: N, email: "ana@example.test", emailVerificadoEn: new Date().toISOString() });
  cookie = (await abrirSesion({ almacen, notariaId: N, clienteId: cliente.id })).split(";")[0];
  const conv = await almacen.conversacion("form:593991234567", "Ana");
  cita = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-01-10", hora: "09:00", nombre: "Ana", tramiteId: "poder" });
  const { token } = await emitirVinculo({ almacen, notariaId: N, solicitudId: cita.id });
  await consumirVinculo({ almacen, notariaId: N, clienteId: cliente.id, token });
  proveedor = crearProveedorFalso({ secreto: "secreto-falso-de-prueba", entorno: "preview" });
  api = crearManejadorPagos({ almacen, contenido: async () => C, proveedor });
});

describe("pagos de trámites", () => {
  it("calcula en el servidor solo tarifas con un valor único", () => {
    expect(montoCentavosDe(C.data.tramites[0], C.tarifas)).toBe(1150);
    expect(montoCentavosDe(C.data.tramites[1], C.tarifas)).toBeNull();
    expect(montoCentavosDe(C.data.tramites[2], C.tarifas)).toBeNull();
  });

  it("inicia una sola orden, no acepta monto del navegador y consulta solo el pago propio", async () => {
    const r = await api.POST(post({ accion: "iniciar", id: cita.id, idempotencia: "clave-unica-0001", montoCentavos: 1 }, cookie));
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ pagoId: expect.any(String), urlCheckout: expect.stringContaining("mis-tramites.html") });
    const estado = await api.GET(new Request(`https://notaria41.sofiaprefirma.com/api/pagos?accion=estado&id=${b.pagoId}`, { headers: { cookie } }));
    expect(await estado.json()).toEqual({ estado: "pendiente", montoCentavos: 1150, moneda: "USD" });
    const repetido = await api.POST(post({ accion: "iniciar", id: cita.id, idempotencia: "otra-clave-00002" }, cookie));
    expect(repetido.status).toBe(200);
    expect((await repetido.json()).pagoId).toBe(b.pagoId);
    expect((await almacen.tramiteDeCliente(N, (await almacen.pagoPorId(N, b.pagoId)).clienteId, cita.id)).pagos).toHaveLength(1);
  });

  it("solo un webhook firmado cambia el estado y una entrega repetida es idempotente", async () => {
    const iniciado = await (await api.POST(post({ accion: "iniciar", id: cita.id, idempotencia: "clave-unica-0003" }, cookie))).json();
    const pago = await almacen.pagoPorId(N, iniciado.pagoId);
    const cuerpo = JSON.stringify({ id: "evento-1", orden: pago.ordenProveedor, estado: "pagado", monto: 1150, moneda: "USD", tipo: "pago.aprobado" });
    const invalido = await api.POST(new Request("https://notaria41.sofiaprefirma.com/api/pagos?webhook=tramite", { method: "POST", body: cuerpo }));
    expect(invalido.status).toBe(401);
    expect((await almacen.pagoPorId(N, iniciado.pagoId)).estado).toBe("pendiente");
    const firma = proveedor.firmarEvento(cuerpo);
    const pedido = () => new Request("https://notaria41.sofiaprefirma.com/api/pagos?webhook=tramite", { method: "POST", headers: { "x-firma": firma }, body: cuerpo });
    expect(await (await api.POST(pedido())).json()).toEqual({ ok: true, resultado: "aplicado" });
    expect((await almacen.pagoPorId(N, iniciado.pagoId)).estado).toBe("pagado");
    expect(await (await api.POST(pedido())).json()).toEqual({ ok: true, duplicado: true });
    const tramite = await almacen.tramiteDeCliente(N, pago.clienteId, cita.id);
    expect(tramite.eventos.filter((e) => e.tipo === "pago_pagado")).toHaveLength(1);
  });

  it("ignora discrepancias de monto y no falla el cobro si la línea de tiempo no está disponible", async () => {
    const iniciado = await (await api.POST(post({ accion: "iniciar", id: cita.id, idempotencia: "clave-unica-0004" }, cookie))).json();
    const pago = await almacen.pagoPorId(N, iniciado.pagoId);
    const enviar = async (id, monto) => {
      const cuerpo = JSON.stringify({ id, orden: pago.ordenProveedor, estado: "pagado", monto, moneda: "USD" });
      return api.POST(new Request("https://notaria41.sofiaprefirma.com/api/pagos?webhook=tramite", { method: "POST", headers: { "x-firma": proveedor.firmarEvento(cuerpo) }, body: cuerpo }));
    };
    expect(await (await enviar("evento-monto-malo", 1)).json()).toEqual({ ok: true, resultado: "discrepancia" });
    expect((await almacen.pagoPorId(N, iniciado.pagoId)).estado).toBe("pendiente");
    almacen.registrarEventoTramite = vi.fn().mockRejectedValue(new Error("sin eventos"));
    expect((await enviar("evento-correcto", 1150)).status).toBe(200);
    expect((await almacen.pagoPorId(N, iniciado.pagoId)).estado).toBe("pagado");
  });

  it("permanece oculto sin interruptores o sin pasarela real", async () => {
    await almacen.guardarAjuste("funcion.pagosEnLinea", "0", "prueba");
    expect((await api.POST(post({ accion: "iniciar", id: cita.id, idempotencia: "clave-unica-0005" }, cookie))).status).toBe(404);
    const sinProveedor = crearManejadorPagos({ almacen, contenido: async () => C, proveedor: null });
    expect((await sinProveedor.GET(new Request("https://notaria41.sofiaprefirma.com/api/pagos?accion=estado&id=x"))).status).toBe(404);
  });
});

it("el proveedor falso no se habilita en producción y las transiciones no tienen ciclos", () => {
  expect(obtenerProveedorPagos({ PAGOS_PROVEEDOR: "falso", PAGOS_SECRETO_PRUEBA: "secreto-falso-de-prueba", VERCEL_ENV: "production" })).toBeNull();
  expect(() => crearProveedorFalso({ secreto: "secreto-falso-de-prueba", entorno: "production" })).toThrow(/producción/);
  expect(puedePasar("pendiente", "pagado")).toBe(true);
  expect(puedePasar("pagado", "pendiente")).toBe(false);
  expect(puedePasar("pagado", "pagado")).toBe(false);
});
