// Burbuja de chat del asistente en la página principal. La página completa está en asistente.html.
import { esc, bienvenida, nombreAsistente, mostrarNombre, NOMBRE_POR_DEFECTO, chatActual, crearChat, agregarMensaje, enviarMensaje, formato } from "./chat-nucleo.js";

const $ = (s) => document.querySelector(s);
// Los cinco trámites más pedidos según el notario, como casos reales.
const SUGERENCIAS = ["Voy a vender mi carro", "Necesito una declaración juramentada", "Necesito que alguien firme por mí", "Mi hijo menor va a viajar al exterior", "Necesito copias certificadas o materializar un documento"];
const raiz = $("#chat"), lista = $("#chatMensajes"), form = $("#chatForm"), campo = $("#chatTexto"), lanzador = $("#chatAbrir");
let chat = chatActual(), enviando = false, nombre = NOMBRE_POR_DEFECTO;
nombreAsistente().then((n) => { nombre = n; mostrarNombre(n); });

function burbuja(m) {
  const div = document.createElement("div");
  div.className = "chat__msg chat__msg--" + m.autor;
  div.innerHTML = m.autor === "cliente" ? esc(m.texto).replace(/\n/g, "<br>") : formato(m.texto);
  lista.appendChild(div);
}
function pintar() {
  chat = chatActual();
  lista.innerHTML = "";
  burbuja({ autor: "asistente", texto: bienvenida(nombre) });
  chat.mensajes.forEach(burbuja);
  $("#chatSugerencias").hidden = chat.mensajes.length > 0;
  lista.scrollTop = lista.scrollHeight;
}
// La respuesta se guarda en la conversación donde se preguntó, aunque la persona ya haya abierto otra.
function agregar(m, sesion = chat.sesion) {
  agregarMensaje(sesion, m);
  if (sesion !== chat.sesion) return;
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
  escribiendo.setAttribute("aria-label", nombre + " está escribiendo");
  escribiendo.innerHTML = "<span></span><span></span><span></span>";
  lista.appendChild(escribiendo); lista.scrollTop = lista.scrollHeight;
  const sesion = chat.sesion;
  const r = await enviarMensaje(sesion, texto);
  escribiendo.remove();
  if (r.error) agregar({ autor: "aviso", texto: r.error }, sesion);
  else r.respuestas.forEach((t) => agregar({ autor: "asistente", texto: t }, sesion));
  enviando = false; form.classList.remove("chat__form--ocupado"); campo.focus();
}

function abrir() {
  raiz.hidden = false; lanzador.setAttribute("aria-expanded", "true"); document.body.classList.add("chat-abierto");
  const wa = document.documentElement.dataset.wa, enlace = $("#chatWhatsapp");
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
// Desde el panel de un trámite: abre el chat con el trámite ya escrito para que la persona cuente su caso.
document.addEventListener("n41:preguntar", (e) => {
  if (raiz.hidden) abrir();
  campo.value = e.detail.texto;
  campo.dispatchEvent(new Event("input"));
  setTimeout(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }, 60);
});
$("#chatNueva").addEventListener("click", () => { crearChat(); pintar(); campo.focus(); });
