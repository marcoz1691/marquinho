export const canalDeTelefono = (tel) => String(tel).startsWith("web:") ? "web" : String(tel).startsWith("form:") ? "formulario" : "whatsapp";
export async function registrar(almacen, clave, valor = 1, t = Date.now()) {
  try {
    if (!valor) return;
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
    await almacen.sumarMetrica(fecha, clave, valor);
  } catch (e) { console.error("Métrica no registrada:", clave, e); }
}
export const CLAVES = [
  ...["conv.nueva", "msg.cliente", "conv.derivada", "cita.creada", "doc.recibido"].flatMap((k) => ["whatsapp", "web", "formulario"].map((c) => k + "." + c)),
  "ia.llamadas", "ia.tokens_entrada", "ia.tokens_salida", "ia.tokens_cache_lectura", "ia.tokens_cache_escritura", "cita.atendida", "cita.cancelada", "cita.inasistencia", "recordatorio.enviado", "respuesta.automatica"
];
export const PRECIOS = { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5, plantillaWhatsapp: 0 };
