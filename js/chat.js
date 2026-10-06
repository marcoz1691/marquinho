// Burbuja de chat del asistente en la página principal. La página completa está en asistente.html.
import { esc, BIENVENIDA, chatActual, crearChat, agregarMensaje, enviarMensaje, formato } from "./chat-nucleo.js";

const $ = (s) => document.querySelector(s);
const SUGERENCIAS = ["¿Cuánto cuesta un poder?", "Requisitos para vender una casa", "Quiero pedir una cita"];
const raiz = $("#chat"), lista = $("#chatMensajes"), form = $("#chatForm"), campo = $("#chatTexto"), lanzador = $("#chatAbrir");
let chat = chatActual(), enviando = false;

function burbuja(m) {
  const div = document.createElement("div");
  div.className = "chat__msg chat__msg--" + m.autor;
  div.innerHTML = m.autor === "cliente" ? esc(m.texto).replace(/\n/g, "<br>") : formato(m.texto);
  lista.appendChild(div);
}
function pintar() {
  chat = chatActual();
  lista.innerHTML = "";
  burbuja({ autor: "asistente", texto: BIENVENIDA });
  chat.mensajes.forEach(burbuja);
  $("#chatSugerencias").hidden = chat.mensajes.length > 0;
  lista.scrollTop = lista.scrollHeight;
}
function agregar(m) {
  agregarMensaje(chat.sesion, m);
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
  const r = await enviarMensaje(chat.sesion, texto);
  escribiendo.remove();
  if (r.error) agregar({ autor: "aviso", texto: r.error });
  else r.respuestas.forEach((t) => agregar({ autor: "asistente", texto: t }));
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
$("#chatNueva").addEventListener("click", () => { crearChat(); pintar(); campo.focus(); });
