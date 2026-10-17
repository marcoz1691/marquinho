// Historial de consentimientos (LOPDP, art. 8; Reglamento, art. 5): cuándo, por qué canal y qué versión de cada texto
// aceptó cada persona. Se guarda aparte de la conversación para que la evidencia sobreviva a la purga de los chats.
import { createHash } from "node:crypto";
import { AVISO_PRIVACIDAD, TERMINOS } from "./privacidad.js";

// El titular se guarda como huella del celular o de la sesión, nunca en claro: basta para ubicar su aceptación si la pide.
export const huellaTitular = (id) => createHash("sha256").update("notaria41:titular:" + String(id)).digest("hex").slice(0, 32);

export async function registrarConsentimiento(almacen, { canal, titular, texto, terminos = true, t = new Date() }) {
  try {
    await almacen.registrarConsentimiento({ canal, titular: huellaTitular(titular), aviso: AVISO_PRIVACIDAD,
      terminos: terminos ? TERMINOS : "", texto: String(texto || "").slice(0, 500), creado: t.toISOString() });
  } catch (e) {
    // La conversación ya guarda su propia evidencia: si el historial falla (por ejemplo, sin la migración), no se corta la atención.
    console.error("Consentimiento no registrado en el historial:", e?.message || e);
  }
}
