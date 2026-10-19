import { esc } from "./chat-nucleo.js";

const $ = (id) => document.getElementById(id);
let cliente = null, filtro = "activos";
const fecha = (f) => f ? new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(f + (f.includes("T") ? "" : "T12:00:00Z"))) : "";

async function api(metodo, accion, datos = {}) {
  const opciones = metodo === "POST" ? { method: "POST", headers: { "Content-Type": "application/json", "X-Sofia": "1" }, body: JSON.stringify({ accion, ...datos }) } : {};
  const url = metodo === "GET" ? "/api/cuenta?" + new URLSearchParams({ accion, ...datos }) : "/api/cuenta";
  let r;
  try { r = await fetch(url, opciones); } catch { throw new Error("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo."); }
  const b = await r.json().catch(() => ({}));
  if (r.status === 401) { location.replace("/cuenta.html"); throw new Error("Tu sesión terminó."); }
  if (!r.ok) throw new Error(b.error || "No pudimos completar la solicitud.");
  return b;
}

function pintarCliente(c) {
  cliente = c;
  $("saludo").textContent = c.nombres ? `Hola, ${c.nombres}. Aquí verás lo que sigue y los documentos que necesitan tu atención.` : "Aquí verás lo que sigue y los documentos que necesitan tu atención.";
  $("perfil").hidden = c.perfilCompleto;
  $("cuenta-correo").textContent = c.email;
  $("avisos-correo").checked = c.avisosCorreo;
  $("avisos-whatsapp").checked = c.avisosWhatsapp;
  $("celular-preferencias").value = c.celular ? "+" + c.celular : "";
}

function tarjeta(t) {
  return `<button class="tramite" type="button" data-id="${esc(t.id)}"><span class="tramite__arriba"><span><span class="tramite__ticket">${t.ticket ? `Ticket ${esc(t.ticket)}` : "Sin ticket"}</span><h2>${esc(t.nombre)}</h2></span><i class="ph ph-arrow-right" aria-hidden="true"></i></span><span class="tramite__estado">${esc(t.estadoTexto)}</span><span class="tramite__siguiente">${esc(t.siguientePaso)}</span><span class="tramite__meta"><span><i class="ph ph-calendar-check" aria-hidden="true"></i> ${esc(fecha(t.cita.fecha))} · ${esc(t.cita.hora)}</span><span><i class="ph ph-files" aria-hidden="true"></i> ${t.documentosEnviados} documento${t.documentosEnviados === 1 ? "" : "s"}</span>${t.documentosPendientes ? `<span>${t.documentosPendientes} por corregir</span>` : ""}</span></button>`;
}

async function cargarLista() {
  $("detalle").hidden = true; $("cuenta-panel").hidden = true; $("lista").hidden = false; $("lista").innerHTML = '<p class="cargando">Cargando tus trámites…</p>';
  try {
    const { tramites } = await api("GET", "tramites", { filtro });
    $("lista").innerHTML = tramites.length ? tramites.map(tarjeta).join("") : `<div class="vacio"><i class="ph ph-files" aria-hidden="true"></i><p>${filtro === "activos" ? "Todavía no tienes trámites en curso. Cuando guardes una cita, aparecerá aquí." : "No tienes trámites finalizados."}</p></div>`;
  } catch (e) { $("lista").innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
}

const documentos = (lista) => lista.length ? lista.map((d) => `<div class="documento documento--${esc(d.estado)}"><strong>${esc(d.descripcion || d.nombre || "Documento")}</strong><span>${esc(d.estadoTexto)}</span>${d.observacion ? `<span>${esc(d.observacion)}</span>` : ""}</div>`).join("") : "<p>Aún no has enviado documentos.</p>";
const eventos = (lista) => lista.length ? `<ol class="linea-tiempo">${[...lista].reverse().map((e) => `<li>${esc(e.texto)}<time datetime="${esc(e.creado)}">${esc(fecha(e.creado))}</time></li>`).join("")}</ol>` : "<p>Aún no hay novedades.</p>";

async function abrirDetalle(id) {
  $("lista").innerHTML = '<p class="cargando">Cargando el trámite…</p>';
  try {
    const { tramite: t } = await api("GET", "tramite", { id });
    $("lista").hidden = true; $("detalle").hidden = false;
    $("detalle").innerHTML = `<header class="detalle__cab"><div><span class="etiqueta-estado">${t.ticket ? `Ticket ${esc(t.ticket)}` : "Tu trámite"}</span><h2>${esc(t.nombre)}</h2><p>${esc(t.estadoTexto)} · ${esc(fecha(t.cita.fecha))} a las ${esc(t.cita.hora)}</p></div><button class="detalle__volver" type="button" data-volver>← Volver</button></header><div class="detalle__grid"><section class="detalle__bloque"><h3>Qué sigue</h3><p>${esc(t.siguientePaso)}</p><h3>Requisitos</h3>${t.requisitos.length ? `<ul>${t.requisitos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>La notaría confirmará los requisitos según tu caso.</p>"}${t.costoReferencial ? `<p class="aviso-pago"><strong>Costo referencial:</strong> ${esc(t.costoReferencial)}. ${esc(t.advertencias.join(" "))}</p>` : ""}</section><section class="detalle__bloque"><h3>Actividad</h3>${eventos(t.eventos)}</section><section class="detalle__bloque"><h3>Documentos</h3>${documentos(t.documentos)}<form class="subir-form" data-subir="${esc(t.id)}"><label>Archivo PDF o imagen<input name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><label>¿Qué documento es?<input name="descripcion" minlength="2" maxlength="120" required placeholder="Ej. Cédula del vendedor"></label><button type="submit">Enviar documento</button><p class="estado" role="status"></p></form></section><section class="detalle__bloque"><h3>Importante</h3><p>${esc(t.avisoNotarial)}</p><p>¿Necesitas ayuda? ${t.ayuda.whatsapp ? `<a href="https://wa.me/${esc(t.ayuda.whatsapp.replace(/\D/g, ""))}">Escríbenos por WhatsApp</a>` : "Contacta a la notaría."}</p></section></div>`;
    history.replaceState(null, "", "/mis-tramites.html?id=" + encodeURIComponent(t.id));
  } catch (e) { $("lista").hidden = false; $("lista").innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
}

const base64 = (archivo) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = () => reject(new Error("No pudimos leer el archivo.")); r.readAsDataURL(archivo); });

$("lista").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) abrirDetalle(b.dataset.id); });
$("detalle").addEventListener("click", (e) => { if (e.target.closest("[data-volver]")) { history.replaceState(null, "", "/mis-tramites.html"); cargarLista(); } });
$("detalle").addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-subir]"); if (!form) return; e.preventDefault();
  const archivo = form.elements.archivo.files[0], estado = form.querySelector(".estado"), boton = form.querySelector("button");
  if (!archivo) { estado.textContent = "Elige un archivo."; return; }
  if (archivo.size > 3 * 1024 * 1024) { estado.textContent = "El archivo pesa más de 3 MB."; return; }
  boton.disabled = true; estado.textContent = "Enviando…";
  try { await api("POST", "subirDocumento", { id: form.dataset.subir, descripcion: form.elements.descripcion.value.trim(), nombre: archivo.name, base64: await base64(archivo) }); await abrirDetalle(form.dataset.subir); }
  catch (err) { estado.textContent = err.message; boton.disabled = false; }
});

document.querySelector(".filtros").addEventListener("click", (e) => { const b = e.target.closest("[data-filtro]"); if (!b) return; filtro = b.dataset.filtro; document.querySelectorAll("[data-filtro]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cargarLista(); });

$("form-perfil").addEventListener("submit", async (e) => {
  e.preventDefault(); const boton = e.submitter; boton.disabled = true; $("perfil-estado").textContent = "Guardando…";
  try { const r = await api("POST", "completarPerfil", { nombres: $("nombres").value.trim(), apellidos: $("apellidos").value.trim(), celular: $("celular").value.trim(), aceptaTerminos: $("acepta-terminos").checked, aceptaPrivacidad: $("acepta-privacidad").checked }); pintarCliente(r.cliente); $("perfil-estado").textContent = ""; }
  catch (err) { $("perfil-estado").textContent = err.message; } finally { boton.disabled = false; }
});

$("ver-cuenta").addEventListener("click", () => { $("lista").hidden = true; $("detalle").hidden = true; $("cuenta-panel").hidden = false; history.replaceState(null, "", "/mis-tramites.html"); });
$("form-preferencias").addEventListener("submit", async (e) => {
  e.preventDefault(); const boton = e.submitter; boton.disabled = true; $("preferencias-estado").textContent = "Guardando…";
  try { const r = await api("POST", "preferencias", { avisosCorreo: $("avisos-correo").checked, avisosWhatsapp: $("avisos-whatsapp").checked, celular: $("celular-preferencias").value.trim() }); pintarCliente(r.cliente); $("preferencias-estado").textContent = "Preferencias guardadas."; }
  catch (err) { $("preferencias-estado").textContent = err.message; } finally { boton.disabled = false; }
});
$("salir").addEventListener("click", async () => { try { await api("POST", "salir"); } finally { location.replace("/cuenta.html"); } });
$("cerrar-todas").addEventListener("click", async () => { if (!confirm("¿Cerrar la sesión en todos tus dispositivos?")) return; try { await api("POST", "salirTodo"); } finally { location.replace("/cuenta.html"); } });

async function iniciar() {
  try {
    const { cliente: c } = await api("GET", "yo"); pintarCliente(c);
    const id = new URLSearchParams(location.search).get("id");
    if (id) await abrirDetalle(id); else await cargarLista();
  } catch (e) { $("lista").innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
}
iniciar();
