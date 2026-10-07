// Autorización de los cron de Vercel: comparan "Bearer <CRON_SECRET>" en tiempo constante.
// Sin CRON_SECRET (o con uno corto) se rechaza todo: así nadie entra mandando "Bearer undefined".
import { timingSafeEqual } from "node:crypto";

export function autorizadoCron(request, secreto) {
  if (!secreto || String(secreto).length < 16) {
    // Sin esto los cron fallarían con 401 y nadie se enteraría. No se registra el valor.
    console.error("Cron rechazado: CRON_SECRET no está configurado o tiene menos de 16 caracteres.");
    return false;
  }
  const esperada = Buffer.from("Bearer " + secreto);
  const recibida = Buffer.from(request.headers.get("authorization") || "");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
