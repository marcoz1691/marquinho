// Lógica común del chat web (burbuja y página del asistente): sesiones, llamada a /api/chat y formato.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

// Nombre del asistente: el mismo que usa el bot (campo "asistente" de la notaría, editable en la hoja).
export const NOMBRE_POR_DEFECTO = "Sofía";
export const bienvenida = (nombre) => "Hola, soy " + nombre + ", de la Notaría 41. Cuéntame qué necesitas hacer y te ayudo con los requisitos, el costo y tu cita.";
export async function nombreAsistente() {
  const hoja = leer("n41-hoja");
  if (hoja && hoja.notaria && hoja.notaria.asistente) return hoja.notaria.asistente;
  try { return (await (await fetch("data/notaria.json")).json()).asistente || NOMBRE_POR_DEFECTO; } catch (e) { return NOMBRE_POR_DEFECTO; }
}
// Pone el nombre en cada elemento marcado con data-nombre.
export function mostrarNombre(nombre) { document.querySelectorAll("[data-nombre]").forEach((el) => { el.textContent = nombre; }); }

export const nuevaSesion = () => "s_" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

// Conversaciones guardadas en este navegador: [{ sesion, titulo, actualizado, mensajes: [{autor, texto}] }]
export function chats() { return leer("n41-chats") || []; }
export function guardarChats(lista) { guardar("n41-chats", lista.slice(0, 30)); }
export function chatActual() {
  let id = leer("n41-chat-sesion"), lista = chats(), c = lista.find((x) => x.sesion === id);
  if (!c) { c = { sesion: id || nuevaSesion(), titulo: "", actualizado: Date.now(), mensajes: [] }; lista.unshift(c); guardarChats(lista); guardar("n41-chat-sesion", c.sesion); }
  return c;
}
export function elegirChat(sesion) { guardar("n41-chat-sesion", sesion); return chatActual(); }
export function crearChat() {
  const c = { sesion: nuevaSesion(), titulo: "", actualizado: Date.now(), mensajes: [] };
  const lista = chats(); lista.unshift(c); guardarChats(lista); guardar("n41-chat-sesion", c.sesion);
  return c;
}
export function agregarMensaje(sesion, m) {
  const lista = chats(), c = lista.find((x) => x.sesion === sesion);
  if (!c) return;
  c.mensajes.push(m); c.mensajes = c.mensajes.slice(-60); c.actualizado = Date.now();
  if (!c.titulo && m.autor === "cliente") c.titulo = m.texto.slice(0, 60);
  lista.sort((a, b) => b.actualizado - a.actualizado);
  guardarChats(lista);
}
export function borrarChat(sesion) { guardarChats(chats().filter((x) => x.sesion !== sesion)); }

// Migra el historial de la versión anterior de la burbuja (una sola conversación).
(function migrar() {
  const viejo = leer("n41-chat-historial"), id = leer("n41-chat-sesion");
  if (!viejo || !viejo.length || !id || chats().some((x) => x.sesion === id)) return;
  const lista = chats();
  lista.unshift({ sesion: id, titulo: (viejo.find((m) => m.autor === "cliente") || {}).texto?.slice(0, 60) || "", actualizado: Date.now(), mensajes: viejo });
  guardarChats(lista);
  try { localStorage.removeItem("n41-chat-historial"); } catch (e) {}
})();

// Envía un mensaje. Devuelve { respuestas: [...] } o { error: "..." }.
export async function enviarMensaje(sesion, texto) {
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesion, texto }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || "No pude responder ahora. Inténtalo de nuevo en unos minutos." };
    return { respuestas: data.respuestas || [] };
  } catch (e) {
    return { error: "Sin conexión. Revisa tu internet e inténtalo de nuevo." };
  }
}

// Texto del asistente a HTML seguro: párrafos, listas con • o -, *negrita* y enlaces.
export function formato(t) {
  const enLinea = (s) => esc(s)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+|wa\.me\/\d+)/g, (u) => '<a href="' + (u.startsWith("http") ? u : "https://" + u) + '" target="_blank" rel="noopener">' + u + "</a>");
  const bloques = [], lineas = String(t).split("\n");
  let lista = null;
  for (const l of lineas) {
    const item = l.match(/^\s*[•\-]\s+(.*)$/);
    if (item) { (lista = lista || []).push("<li>" + enLinea(item[1]) + "</li>"); continue; }
    if (lista) { bloques.push("<ul>" + lista.join("") + "</ul>"); lista = null; }
    if (l.trim()) bloques.push("<p>" + enLinea(l) + "</p>");
  }
  if (lista) bloques.push("<ul>" + lista.join("") + "</ul>");
  return bloques.join("");
}
