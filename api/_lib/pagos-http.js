// API de pagos del portal (Sofía PreFirma, caso A). El monto lo calcula el servidor; la vuelta del navegador nunca cambia el estado:
// solo el webhook firmado de la pasarela lo hace. Nunca se reciben ni guardan datos de tarjeta, y del webhook se guarda solo la huella del cuerpo.
//   POST { accion: "iniciar", id, idempotencia }  (sesión del cliente)  → { urlCheckout, pagoId }
//   GET  ?accion=estado&id=<pagoId>               (sesión del cliente)  → { estado, montoCentavos, moneda }
//   POST ?webhook=tramite                         (pasarela, firmado)   → { ok, resultado } | { ok, duplicado }
import { createHash } from "node:crypto";
import { leerAjustes, leerFunciones, funcionWebActiva } from "./funciones.js";
import { leerSesion, mismoOrigen } from "./sesion-cliente.js";
import { notariaDe } from "./notaria.js";
import { calcularTarifa, money } from "../../js/nucleo.js";
import { ESTADOS, puedePasar } from "./pagos/proveedor.js";

const NO_DISPONIBLE = "El pago en línea no está disponible: paga en la notaría el día de tu trámite.";
const SEGUN_CASO = "El valor de este trámite lo define la notaría según tu caso.";
const FALLO_PASARELA = "No pudimos iniciar el pago en línea. Inténtalo más tarde o paga en la notaría el día de tu trámite.";
const MAX_WEBHOOK = 64 * 1024;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sha256 = (datos) => createHash("sha256").update(datos).digest("hex");

// Solo tarifas con un valor único: porcentaje del SBU o valor fijo, sin unidades («por hoja», «por firma»…) ni cuantía.
export function montoCentavosDe(tramite, tarifas) {
  const f = tramite?.tarifa;
  if (!f || !["pct", "fija"].includes(f.tipo) || (f.unidad && /por/.test(f.unidad))) return null;
  const { total } = calcularTarifa(tramite, tarifas);
  return total > 0 ? Math.round(total * 100) : null;
}

const TEXTO_CLIENTE = {
  pendiente: (p) => `Iniciaste el pago en línea de ${money(p.montoCentavos / 100)}.`,
  pagado: (p) => `Recibimos tu pago de ${money(p.montoCentavos / 100)}. ¡Gracias!`,
  fallido: () => "Tu pago no se completó. Puedes intentarlo de nuevo o pagar en la notaría el día de tu trámite.",
  cancelado: () => "El pago se canceló. Puedes intentarlo de nuevo o pagar en la notaría el día de tu trámite.",
  reembolsado: (p) => `Te devolvimos el pago de ${money(p.montoCentavos / 100)}. Puede tardar unos días en verse en tu cuenta.`
};
async function eventoTramite(almacen, pago, estado) {
  if (!pago.solicitudId || !TEXTO_CLIENTE[estado]) return;
  await almacen.registrarEventoTramite({ notariaId: pago.notariaId, solicitudId: pago.solicitudId, tipo: "pago_" + estado,
    textoCliente: TEXTO_CLIENTE[estado](pago), actor: estado === "pendiente" ? "cliente" : "sistema" });
}

// Lee el cuerpo crudo con tope de tamaño; null si se pasa.
async function cuerpoCrudo(request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_WEBHOOK) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength > MAX_WEBHOOK ? null : bytes;
}

export function crearManejadorPagos({ almacen, contenido, proveedor, ahora = () => Date.now() }) {
  // El cliente solo ve el pago en línea con el portal y los pagos encendidos y una pasarela configurada.
  async function disponible() {
    if (!proveedor) return false;
    const f = leerFunciones(await leerAjustes(almacen));
    return funcionWebActiva(f, "portal") && funcionWebActiva(f, "pagosEnLinea");
  }
  const sesionDe = (request) => leerSesion({ almacen, request, notariaId: notariaDe(request), ahora: ahora() });

  async function iniciar(request) {
    if (!mismoOrigen(request)) return json({ error: "Solicitud no permitida" }, 403);
    let b;
    try { b = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
    if (b?.accion !== "iniciar") return json({ error: "Acción desconocida" }, 400);
    const s = await sesionDe(request);
    if (!s) return json({ error: "Inicia sesión para continuar." }, 401);
    const notariaId = s.sesion.notariaId, clienteId = s.cliente.id;
    const id = String(b.id || ""), idempotencia = String(b.idempotencia || "");
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return json({ error: "No encontramos ese trámite." }, 404);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(idempotencia)) return json({ error: "Solicitud inválida" }, 400);

    const t = await almacen.tramiteDeCliente(notariaId, clienteId, id);
    if (!t) return json({ error: "No encontramos ese trámite." }, 404);
    if (!["pendiente", "confirmada"].includes(t.estado)) return json({ error: "Este trámite ya no admite pago en línea." }, 409);
    const { data, tarifas } = await contenido();
    const ficha = (data?.tramites || []).find((x) => x.id === t.tramiteId);
    const montoCentavos = montoCentavosDe(ficha, tarifas);
    if (!montoCentavos) return json({ error: SEGUN_CASO }, 409);
    if ((t.pagos || []).some((p) => ["procesando", "pagado"].includes(p.estado))) return json({ error: "Este trámite ya tiene un pago registrado." }, 409);

    // Un pago pendiente del mismo trámite y monto se retoma: evita dos cobros por el mismo trámite.
    const abierto = (t.pagos || []).find((p) => p.estado === "pendiente" && p.montoCentavos === montoCentavos);
    let pago = abierto ? await almacen.pagoPorId(notariaId, abierto.id)
      : await almacen.crearPago({ notariaId, solicitudId: t.id, clienteId, ticketSnapshot: String(t.codigo ?? ""), concepto: String(ficha.nombre).slice(0, 200),
        montoCentavos, moneda: "USD", proveedor: proveedor.nombre, idempotencia });
    if (pago.clienteId !== clienteId || pago.solicitudId !== t.id || pago.proveedor !== proveedor.nombre)
      return json({ error: "Ese intento de pago no corresponde. Recarga la página e inténtalo de nuevo." }, 409);
    if (!["creado", "pendiente"].includes(pago.estado)) return json({ error: "Ese intento de pago ya terminó. Recarga la página e inténtalo de nuevo." }, 409);

    const urlRetorno = new URL(`/mis-tramites.html?pago=${encodeURIComponent(pago.id)}`, request.url).href;
    try {
      let orden = pago.ordenProveedor;
      if (!orden) {
        ({ orden } = await proveedor.crearOrden({ pago, urlRetorno }));
        await almacen.fijarOrdenPago(pago.id, orden);
      }
      if (pago.estado === "creado" && await almacen.transicionarPago(pago.id, "creado", "pendiente")) {
        await almacen.registrarEventoPago({ pagoId: pago.id, proveedor: proveedor.nombre, eventoProveedorId: `interno:${pago.id}:pendiente`, tipo: "checkout_iniciado",
          estadoAnterior: "creado", estadoNuevo: "pendiente", montoCentavos: pago.montoCentavos, moneda: pago.moneda, firmaValida: true, resultado: "aplicado" });
        await eventoTramite(almacen, pago, "pendiente");
      }
      const { urlCheckout } = await proveedor.iniciarCheckout({ pago, orden, urlRetorno });
      return json({ urlCheckout, pagoId: pago.id });
    } catch (e) {
      console.error("Pagos: no se pudo iniciar el checkout:", e.message);
      return json({ error: FALLO_PASARELA }, 502);
    }
  }

  // Solo consulta lo guardado: la vuelta del navegador desde la pasarela nunca cambia el estado.
  async function estado(request) {
    const s = await sesionDe(request);
    if (!s) return json({ error: "Inicia sesión para continuar." }, 401);
    const id = new URL(request.url).searchParams.get("id") || "";
    const noEsTuyo = json({ error: "No encontramos ese pago." }, 404);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return noEsTuyo;
    const pago = await almacen.pagoPorId(s.sesion.notariaId, id);
    if (!pago?.solicitudId || pago.clienteId !== s.cliente.id) return noEsTuyo;
    if (!await almacen.tramiteDeCliente(s.sesion.notariaId, s.cliente.id, pago.solicitudId)) return noEsTuyo;
    return json({ estado: pago.estado, montoCentavos: pago.montoCentavos, moneda: pago.moneda });
  }

  // Webhook de la pasarela: firma → conciliación → transición condicionada → registro único del evento.
  // pago_eventos es de solo agregar, así que el resultado se decide antes de registrarlo; el registro único descarta repetidos.
  async function webhook(request) {
    if (!proveedor) return json({ error: "No disponible" }, 404);
    const bytes = await cuerpoCrudo(request);
    if (!bytes) return json({ error: "Cuerpo demasiado grande" }, 413);
    const huellaCuerpo = sha256(bytes);
    let ev;
    try {
      ev = await proveedor.procesarWebhook(new Request(request.url, { method: "POST", headers: request.headers, body: bytes }));
    } catch (e) {
      console.error("Pagos: webhook ilegible:", e.message);
      return json({ error: "Evento inválido" }, 400);
    }
    const nombre = proveedor.nombre, cargaHuella = ev.cargaHuella || huellaCuerpo;
    if (!ev.valido) {
      // Con prefijo propio: un evento falsificado no puede ocupar el id de un evento real futuro.
      await almacen.registrarEventoPago({ proveedor: nombre, eventoProveedorId: "firma_invalida:" + cargaHuella, tipo: "", firmaValida: false,
        resultado: "firma_invalida", cargaHuella });
      console.warn("Pagos: webhook con firma inválida", cargaHuella.slice(0, 12));
      return json({ error: "Firma inválida" }, 401);
    }

    const pago = await almacen.pagoPorOrden(nombre, ev.orden);
    const nuevo = ev.estado;
    const registro = { pagoId: pago?.id || null, proveedor: nombre, eventoProveedorId: ev.eventoId, tipo: ev.tipo || "", estadoAnterior: pago?.estado ?? null,
      estadoNuevo: ESTADOS.includes(nuevo) ? nuevo : null, montoCentavos: Number.isInteger(ev.monto) ? ev.monto : null,
      moneda: typeof ev.moneda === "string" ? ev.moneda.slice(0, 3) : null, firmaValida: true, cargaHuella };
    const montoExigido = ["pagado", "reembolsado"].includes(nuevo) || ev.monto != null;
    const monedaExigida = ["pagado", "reembolsado"].includes(nuevo) || ev.moneda != null;
    const discrepancia = !pago || pago.proveedor !== nombre || (montoExigido && ev.monto !== pago.montoCentavos) || (monedaExigida && ev.moneda !== pago.moneda);

    let resultado = "discrepancia", aplicado = false;
    if (!discrepancia) {
      aplicado = puedePasar(pago.estado, nuevo)
        && await almacen.transicionarPago(pago.id, pago.estado, nuevo, nuevo === "pagado" ? { pagadoEn: new Date(ahora()).toISOString() } : {});
      resultado = aplicado ? "aplicado" : "ignorado_orden";
    }
    const { duplicado } = await almacen.registrarEventoPago({ ...registro, resultado });
    // Si esta entrega aplicó el cambio (la transición condicionada solo la gana una), el cliente igual recibe su aviso.
    if (aplicado) await eventoTramite(almacen, pago, nuevo);
    if (duplicado) return json({ ok: true, duplicado: true });
    if (discrepancia) console.warn("Pagos: discrepancia en el evento", ev.eventoId, pago ? "(monto, moneda o proveedor)" : "(orden desconocida)");
    return json({ ok: true, resultado });
  }

  return {
    async GET(request) {
      if (!await disponible()) return json({ error: NO_DISPONIBLE }, 404);
      if (new URL(request.url).searchParams.get("accion") !== "estado") return json({ error: "Acción desconocida" }, 400);
      return estado(request);
    },
    async POST(request) {
      if (new URL(request.url).searchParams.get("webhook") === "tramite") return webhook(request);
      if (!await disponible()) return json({ error: NO_DISPONIBLE }, 404);
      return iniciar(request);
    }
  };
}
