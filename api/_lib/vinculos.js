// Enlaces para guardar un trámite en una cuenta (Sofía PreFirma). El ticket nunca vincula: solo este token, aleatorio
// (32 bytes), de un solo uso y con vencimiento. En la base se guarda solo su sha256 (docs/adr/0004).
import { randomBytes, createHash } from "node:crypto";

const HORA = 3600e3;
export const VIGENCIA = { creacion: 24 * HORA, whatsapp: 72 * HORA, panel: 72 * HORA };
export const huellaToken = (token) => createHash("sha256").update(String(token)).digest("hex");
// 32 bytes en base64url sin relleno = 43 caracteres.
export const tokenValido = (token) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export async function emitirVinculo({ almacen, notariaId, solicitudId, canal = "creacion", creadoPor = "sistema", ahora = Date.now() }) {
  if (!VIGENCIA[canal]) throw new Error("Canal de vinculación inválido");
  const token = randomBytes(32).toString("base64url"), expira = ahora + VIGENCIA[canal];
  await almacen.crearVinculacion({ notariaId, solicitudId, tokenHash: huellaToken(token), canal, expiraEn: new Date(expira).toISOString(), creadoPor });
  return { token, expira };
}

// Devuelve el id del trámite vinculado o null (token usado, vencido, inexistente, de otra notaría o trámite ajeno).
// Audita cada intento con solo los 8 primeros caracteres de la huella: nunca el token.
export async function consumirVinculo({ almacen, notariaId, clienteId, token, ahora = Date.now() }) {
  if (!tokenValido(token)) {
    await almacen.auditar({ email: "cliente:" + clienteId, accion: "vincularTramite", objetivo: "formato", ok: false });
    return null;
  }
  const huella = huellaToken(token);
  const solicitudId = await almacen.consumirVinculacion({ notariaId, tokenHash: huella, clienteId, ahora });
  if (solicitudId) await almacen.registrarEventoTramite({ notariaId, solicitudId, tipo: "vinculada", textoCliente: "Guardaste este trámite en tu cuenta.", actor: "cliente" });
  await almacen.auditar({ email: "cliente:" + clienteId, accion: "vincularTramite", objetivo: huella.slice(0, 8), ok: !!solicitudId });
  return solicitudId || null;
}
