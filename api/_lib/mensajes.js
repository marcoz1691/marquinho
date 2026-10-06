// Texto visible de un mensaje del historial (sin thinking, herramientas ni mensajes de sistema).
export const PREFIJO_PERSONAL = "[Personal de la notaría] ";

export function textoVisible(m) {
  if (m.role === "user" && typeof m.content === "string") return { autor: "cliente", texto: m.content };
  if (m.role !== "assistant") return null;
  const texto = (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!texto) return null;
  return texto.startsWith(PREFIJO_PERSONAL) ? { autor: "personal", texto: texto.slice(PREFIJO_PERSONAL.length) } : { autor: "asistente", texto };
}
