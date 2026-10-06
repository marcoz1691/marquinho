// Chat del asistente en la página web. Conversa con /api/chat (el mismo asistente que WhatsApp).
const $ = (s, el) => (el || document).querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

const BIENVENIDA = "Hola, soy el asistente automático de la Notaría 41. Pregúntame por requisitos, costos o para pedir una cita.";
const SUGERENCIAS = ["¿Cuánto cuesta un poder?", "Requisitos para vender una casa", "Quiero pedir una cita"];

// Texto del asistente a HTML seguro: *negrita*, saltos de línea y enlaces.
function formato(t) {
  return esc(t)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+|wa\.me\/\d+)/g, (u) => '<a href="' + (u.startsWith("http") ? u : "https://" + u) + '" target="_blank" rel="noopener">' + u + "</a>")
    .replace(/\n/g, "<br>");
}

const raiz = $("#chat"), lista = $("#chatMensajes"), form = $("#chatForm"), campo = $("#chatTexto"), lanzador = $("#chatAbrir");
let sesion = leer("n41-chat-sesion");
if (!sesion) { sesion = "s_" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); guardar("n41-chat-sesion", sesion); }
let historial = leer("n41-chat-historial") || [];
let enviando = false;

function burbuja(m) {
  const div = document.createElement("div");
  div.className = "chat__msg chat__msg--" + m.autor;
  div.innerHTML = m.autor === "cliente" ? esc(m.texto).replace(/\n/g, "<br>") : formato(m.texto);
  lista.appendChild(div);
}
function pintar() {
  lista.innerHTML = "";
  burbuja({ autor: "asistente", texto: BIENVENIDA });
  historial.forEach(burbuja);
  $("#chatSugerencias").hidden = historial.length > 0;
  lista.scrollTop = lista.scrollHeight;
}
function agregar(m) {
  historial.push(m);
  historial = historial.slice(-40);
  guardar("n41-chat-historial", historial);
  burbuja(m);
  $("#chatSugerencias").hidden = true;
  lista.scrollTop = lista.scrollHeight;
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || enviando) return;
  enviando = true; form.classList.add("chat__form--ocupado");
  agregar({ autor: "cliente", texto });
  const escribiendo = document.createElement("div");
  escribiendo.className = "chat__msg chat__msg--asistente chat__escribiendo";
  escribiendo.setAttribute("aria-label", "El asistente está escribiendo");
  escribiendo.innerHTML = "<span></span><span></span><span></span>";
  lista.appendChild(escribiendo); lista.scrollTop = lista.scrollHeight;
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesion, texto }) });
    const data = await r.json().catch(() => ({}));
    escribiendo.remove();
    if (!r.ok) agregar({ autor: "aviso", texto: data.error || "No pude responder ahora. Inténtalo de nuevo en unos minutos." });
    else (data.respuestas || []).forEach((t) => agregar({ autor: "asistente", texto: t }));
  } catch (e) {
    escribiendo.remove();
    agregar({ autor: "aviso", texto: "Sin conexión. Revisa tu internet e inténtalo de nuevo." });
  } finally {
    enviando = false; form.classList.remove("chat__form--ocupado"); campo.focus();
  }
}

function abrir() {
  raiz.hidden = false; lanzador.setAttribute("aria-expanded", "true"); document.body.classList.add("chat-abierto");
  const wa = document.documentElement.dataset.wa;
  const enlace = $("#chatWhatsapp");
  if (wa) { enlace.href = "https://wa.me/" + wa; enlace.hidden = false; }
  pintar();
  setTimeout(() => campo.focus(), 50);
}
function cerrar() { raiz.hidden = true; lanzador.setAttribute("aria-expanded", "false"); document.body.classList.remove("chat-abierto"); lanzador.focus(); }

lanzador.addEventListener("click", () => (raiz.hidden ? abrir() : cerrar()));
$("#chatCerrar").addEventListener("click", cerrar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !raiz.hidden) cerrar(); });
form.addEventListener("submit", (e) => { e.preventDefault(); const t = campo.value; campo.value = ""; campo.style.height = ""; enviar(t); });
campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 120) + "px"; });
$("#chatSugerencias").innerHTML = SUGERENCIAS.map((s) => '<button type="button" class="chat__sug">' + esc(s) + "</button>").join("");
$("#chatSugerencias").addEventListener("click", (e) => { const b = e.target.closest(".chat__sug"); if (b) enviar(b.textContent); });
$("#chatNueva").addEventListener("click", () => {
  historial = []; guardar("n41-chat-historial", historial);
  sesion = "s_" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); guardar("n41-chat-sesion", sesion);
  pintar(); campo.focus();
});
