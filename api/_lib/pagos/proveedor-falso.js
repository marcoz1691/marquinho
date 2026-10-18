// Pasarela falsa, solo para pruebas y desarrollo: no cobra nada y se niega a funcionar en producción.
// Los webhooks se firman con HMAC-SHA256 del cuerpo crudo en la cabecera x-firma. Nunca maneja datos de tarjeta.
import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const CABECERA_FIRMA = "x-firma";
const sha256 = (texto) => createHash("sha256").update(texto).digest("hex");

export function crearProveedorFalso({ secreto, entorno } = {}) {
  if (entorno === "production") throw new Error("El proveedor de pagos falso no puede usarse en producción");
  if (typeof secreto !== "string" || secreto.length < 16) throw new Error("El proveedor de pagos falso necesita un secreto de al menos 16 caracteres");
  const ordenes = new Map();
  const firmarEvento = (cuerpo) => createHmac("sha256", secreto).update(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)).digest("hex");
  const firmaValida = (cuerpo, firma) => {
    if (!/^[0-9a-f]{64}$/.test(firma)) return false;
    return timingSafeEqual(Buffer.from(firmarEvento(cuerpo), "hex"), Buffer.from(firma, "hex"));
  };

  return {
    nombre: "falso",
    firmarEvento,
    async crearOrden({ pago }) {
      const orden = "falso_" + randomUUID();
      ordenes.set(orden, { estado: "pendiente", monto: pago.montoCentavos, moneda: pago.moneda || "USD" });
      return { orden };
    },
    // Sin cobro real: vuelve a la página del cliente, que consulta el estado guardado.
    async iniciarCheckout({ pago }) {
      return { urlCheckout: `/mis-tramites.html?pago=${encodeURIComponent(pago.id)}` };
    },
    async consultarPago({ orden }) {
      const o = ordenes.get(orden);
      return o ? { ...o } : { estado: null, monto: null, moneda: null };
    },
    async procesarWebhook(request) {
      const cuerpo = await request.text();
      const cargaHuella = sha256(cuerpo);
      if (!firmaValida(cuerpo, request.headers.get(CABECERA_FIRMA) || "")) return { valido: false, cargaHuella };
      let e;
      try { e = JSON.parse(cuerpo); } catch { throw new Error("Evento firmado pero ilegible"); }
      if (typeof e?.id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(e.id) || typeof e.orden !== "string") throw new Error("Evento incompleto");
      return { valido: true, eventoId: e.id, orden: e.orden, estado: e.estado, monto: e.monto, moneda: e.moneda, tipo: String(e.tipo || "").slice(0, 60), cargaHuella };
    }
  };
}
