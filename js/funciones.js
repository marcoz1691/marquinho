import { banderasAceptacion } from "./aceptacion.js";
export function aplicarFunciones(f, raiz = document) {
  raiz.querySelectorAll("[data-funcion]").forEach(el => { el.hidden = f[el.dataset.funcion] === false; });
}
// Conserva apagada en las respuestas, incluso si la configuración pública está en caché.
export async function enviarChat(sesion, texto) {
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesion, texto, ...banderasAceptacion() }) });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { respuestas: data.respuestas || [], tarjetas: data.tarjetas || [] } : { error: data.error || "No pude responder ahora. Inténtalo de nuevo en unos minutos.", apagada: data.apagada === true, aceptacion: data.aceptacion === true };
  } catch { return { error: "Sin conexión. Revisa tu internet e inténtalo de nuevo." }; }
}
