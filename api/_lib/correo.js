// Envío de correos al cliente del portal (códigos de acceso). Sin proveedor configurado devuelve null y el portal no
// ofrece cuentas (docs/adr/0004). Nunca registra en los logs el contenido del correo ni la dirección completa.

// «ana@example.com» → «***@example.com»: basta para saber a qué dominio fue, sin guardar el dato personal.
export const ocultarCorreo = (email) => "***@" + (String(email || "").split("@")[1] || "");

export function crearCorreo(env = process.env, { fetch = globalThis.fetch } = {}) {
  if (env.RESEND_API_KEY && env.CORREO_REMITENTE) {
    return {
      async enviar({ para, asunto, texto, html }) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ from: env.CORREO_REMITENTE, to: [para], subject: asunto, text: texto, html }),
          signal: AbortSignal.timeout(10_000)
        });
        // Solo el estado HTTP: la respuesta del proveedor podría repetir el destinatario.
        if (!r.ok) throw new Error("El proveedor de correo respondió HTTP " + r.status);
      }
    };
  }
  // Para desarrollo local: no envía nada y solo deja constancia del dominio. Nunca en producción.
  if (env.CORREO === "consola" && env.VERCEL_ENV !== "production") {
    return { async enviar({ para }) { console.info("Código enviado a " + ocultarCorreo(para)); } };
  }
  return null;
}

// Para las pruebas: guarda los correos en .enviados en lugar de enviarlos.
export function crearCorreoMemoria() {
  const enviados = [];
  return { enviados, async enviar(m) { enviados.push(structuredClone(m)); } };
}
