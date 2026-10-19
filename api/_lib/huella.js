// Huella de la IP de un pedido para los límites de uso: se guarda el hash, nunca la IP en claro.
import { createHash } from "node:crypto";

export const ipDe = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconocida";
export const huellaIp = (request) => createHash("sha256").update("notaria41:" + ipDe(request)).digest("hex").slice(0, 24);
