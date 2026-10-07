// Autorización de los cron de Vercel: comparan "Bearer <CRON_SECRET>" en tiempo constante.
// Sin CRON_SECRET (o con uno corto) se rechaza todo: así nadie entra mandando "Bearer undefined".
import { timingSafeEqual } from "node:crypto";

export function autorizadoCron(request, secreto) {
  if (!secreto || String(secreto).length < 16) return false;
  const esperada = Buffer.from("Bearer " + secreto);
  const recibida = Buffer.from(request.headers.get("authorization") || "");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
