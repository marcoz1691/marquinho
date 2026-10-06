// Página del asistente a pantalla completa (diseño tipo LibreChat).
import { esc, nombreAsistente, mostrarNombre, NOMBRE_POR_DEFECTO, chats, chatActual, elegirChat, crearChat, agregarMensaje, borrarChat, enviarMensaje, formato } from "./chat-nucleo.js";

const $ = (s) => document.querySelector(s);
const hilo = $("#hilo"), mensajes = $("#mensajes"), form = $("#form"), campo = $("#texto"), boton = $("#enviar");
let chat = chatActual(), enviando = false, nombre = NOMBRE_POR_DEFECTO;
nombreAsistente().then((n) => { nombre = n; mostrarNombre(n); document.title = n + " | Notaría 41 de Quito"; });

// Número de WhatsApp de la notaría (mismo dato que usa la página principal).
fetch("data/notaria.json").then((r) => r.json()).then((n) => {
  const wa = String(n.whatsapp || "").replace(/\D/g, "");
  if (wa) { const a = $("#ladoWhatsapp"); a.href = "https://wa.me/" + wa; a.hidden = false; }
}).catch(() => {});

function grupo(ts) {
  const d = new Date(ts), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return dias <= 0 ? "Hoy" : dias === 1 ? "Ayer" : dias < 7 ? "Últimos 7 días" : "Anteriores";
}
function pintarHistorial() {
  const lista = chats().filter((c) => c.mensajes.length);
  let html = "", actualGrupo = "";
  for (const c of lista) {
    const g = grupo(c.actualizado);
    if (g !== actualGrupo) { html += '<p class="ac-grupo">' + g + "</p>"; actualGrupo = g; }
    html += '<div class="ac-item' + (c.sesion === chat.sesion ? " ac-item--on" : "") + '"><button type="button" data-s="' + esc(c.sesion) + '">' + esc(c.titulo || "Conversación") +
      '</button><button type="button" class="ac-borrar" data-borrar="' + esc(c.sesion) + '" aria-label="Borrar conversación"><i class="ph ph-trash" aria-hidden="true"></i></button></div>';
  }
  $("#historial").innerHTML = html || '<p class="ac-vacio">Tus conversaciones aparecerán aquí.</p>';
}

function nodo(m) {
  const art = document.createElement("article");
  art.className = "ac-msg ac-msg--" + m.autor;
  if (m.autor === "cliente") art.innerHTML = '<div class="ac-burbuja">' + esc(m.texto).replace(/\n/g, "<br>") + "</div>";
  else if (m.autor === "aviso") art.innerHTML = '<div class="ac-aviso"><i class="ph ph-info" aria-hidden="true"></i>' + esc(m.texto) + "</div>";
  else art.innerHTML = '<img class="ac-avatar" src="assets/logo/logo-notaria41-verde.svg" alt="" width="30" height="30"><div class="ac-cuerpo"><b class="ac-nombre">' + esc(nombre) + '</b><div class="ac-texto">' +
    formato(m.texto) + '</div><div class="ac-acciones"><button type="button" class="ac-copiar" aria-label="Copiar respuesta"><i class="ph ph-copy" aria-hidden="true"></i></button></div></div>';
  if (m.autor === "asistente") art.querySelector(".ac-copiar").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(m.texto); const b = e.currentTarget; b.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i>'; setTimeout(() => { b.innerHTML = '<i class="ph ph-copy" aria-hidden="true"></i>'; }, 1500); } catch (err) {}
  });
  return art;
}
function abajo() { hilo.scrollTop = hilo.scrollHeight; }
function pintar() {
  mensajes.innerHTML = "";
  chat.mensajes.forEach((m) => mensajes.appendChild(nodo(m)));
  $("#inicio").hidden = chat.mensajes.length > 0;
  pintarHistorial();
  abajo();
}
// La respuesta se guarda en la conversación donde se preguntó, aunque la persona ya haya abierto otra.
function agregar(m, sesion = chat.sesion) {
  agregarMensaje(sesion, m);
  if (sesion !== chat.sesion) return pintarHistorial();
  chat = chatActual();
  $("#inicio").hidden = true;
  mensajes.appendChild(nodo(m));
  pintarHistorial();
  abajo();
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || enviando) return;
  enviando = true; boton.disabled = true;
  agregar({ autor: "cliente", texto });
  const pensando = document.createElement("article");
  pensando.className = "ac-msg ac-msg--asistente";
  pensando.innerHTML = '<img class="ac-avatar" src="assets/logo/logo-notaria41-verde.svg" alt="" width="30" height="30"><div class="ac-cuerpo"><b class="ac-nombre">' + esc(nombre) + '</b><div class="ac-pensando" aria-label="' + esc(nombre) + ' está escribiendo"><span></span><span></span><span></span></div></div>';
  mensajes.appendChild(pensando); abajo();
  const sesion = chat.sesion;
  const r = await enviarMensaje(sesion, texto);
  pensando.remove();
  if (r.error) agregar({ autor: "aviso", texto: r.error }, sesion);
  else r.respuestas.forEach((t) => agregar({ autor: "asistente", texto: t }, sesion));
  enviando = false; boton.disabled = !campo.value.trim(); campo.focus();
}

function nueva() { chat = crearChat(); pintar(); cerrarLado(); campo.focus(); }
function abrirLado() { document.body.classList.add("ac--lado"); $("#velo").hidden = false; }
function cerrarLado() { document.body.classList.remove("ac--lado"); $("#velo").hidden = true; }

form.addEventListener("submit", (e) => { e.preventDefault(); const t = campo.value; campo.value = ""; campo.style.height = ""; boton.disabled = true; enviar(t); });
campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 200) + "px"; boton.disabled = enviando || !campo.value.trim(); });
$("#tarjetas").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) enviar(b.dataset.p); });
$("#nueva").addEventListener("click", nueva);
$("#nuevaMovil").addEventListener("click", nueva);
$("#abrirLado").addEventListener("click", abrirLado);
$("#cerrarLado").addEventListener("click", cerrarLado);
$("#velo").addEventListener("click", cerrarLado);
$("#historial").addEventListener("click", (e) => {
  const b = e.target.closest("[data-borrar]");
  if (b) {
    if (!confirm("¿Borrar esta conversación de este navegador?")) return;
    borrarChat(b.dataset.borrar);
    if (b.dataset.borrar === chat.sesion) chat = crearChat();
    return pintar();
  }
  const s = e.target.closest("[data-s]");
  if (s) { chat = elegirChat(s.dataset.s); pintar(); cerrarLado(); }
});

pintar();
campo.focus();
