import { precioTexto, calcularTarifa, money } from "../js/nucleo.js";

// Panel del personal. La librería de Supabase llega desde vendor/ (ver index.html).
const { createClient } = window.supabase;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Lo que trae el enlace del correo, leído antes de que la librería limpie la URL.
const enlace = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
const tipoEnlace = enlace.get("type");               // invite | recovery
const errorEnlace = enlace.get("error_code") || enlace.get("error");
const cfg = await (await fetch("/api/panel-config")).json();
// Los enlaces de invitación y recuperación traen la sesión en la URL (#access_token…): flujo "implicit".
// PKCE no sirve aquí: las invitaciones las crea el administrador desde Supabase y no hay un verificador en este navegador.
// El token del enlace lo protege la política de seguridad (CSP) del sitio y la verificación en dos pasos.
const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true } });
let actual = null, timer = null, pestanaActual = "app";

const TRADUCCION = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Tu correo aún no está confirmado. Abre el enlace que te enviamos.",
  "New password should be different from the old password.": "La nueva contraseña debe ser distinta de la anterior.",
  "Auth session missing!": "La sesión del enlace expiró. Pide un enlace nuevo."
};
const traducir = (m) => TRADUCCION[m] || (/rate limit/i.test(m) ? "Hiciste demasiados intentos. Espera unos minutos." : /Password should be/i.test(m) ? "La contraseña es demasiado débil: usa al menos 8 caracteres." : m);

async function api(metodo, params) {
  const { data: { session } } = await sb.auth.getSession();
  const opts = { method: metodo, headers: { Authorization: "Bearer " + (session?.access_token || ""), "Content-Type": "application/json" } };
  let url = "/api/panel";
  if (metodo === "GET") url += "?" + new URLSearchParams(params); else opts.body = JSON.stringify(params);
  const r = await fetch(url, opts), data = await r.json();
  if (r.status === 401) { if (data.mfa) await pasoMfa(); else vista("vEntrar"); throw Object.assign(new Error(data.error), { mfa: !!data.mfa }); }
  if (r.status === 403) { const e = new Error(data.error); e.sinPermiso = true; throw e; }
  if (!r.ok) throw new Error(data.error);
  return data;
}

// Solo una pantalla visible a la vez.
function vista(id) {
  clearInterval(timer);
  $("#preciosV").hidden = true; $("#app").hidden = true; $("#agendaV").hidden = true; $("#tabs").hidden = true; $("#salir").hidden = true; $("#acceso").hidden = false;
  document.querySelectorAll("[data-vista]").forEach((v) => { v.hidden = v.id !== id; });
  document.querySelectorAll(".msg").forEach((m) => { m.textContent = ""; m.className = "msg"; });
  const foco = $("#" + id + " input"); if (foco) setTimeout(() => foco.focus(), 30);
}
const mensaje = (id, texto, tipo = "error") => { const m = $("#" + id); m.textContent = texto; m.className = "msg msg--" + tipo; };
async function ocupado(form, fn) {
  const b = form.querySelector(".btn"); const txt = b.textContent; b.disabled = true; b.textContent = "Un momento…";
  try { await fn(); } finally { b.disabled = false; b.textContent = txt; }
}

/* ---------- Verificación en dos pasos (TOTP) ---------- */
let factorMfa = null;
// Después de la contraseña: si el panel exige la verificación y la sesión aún no la tiene, pide el código o la activa.
async function continuar() {
  if (cfg.mfa) {
    const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.currentLevel !== "aal2") return pasoMfa();
  }
  return mostrarApp();
}
let mfaEnCurso = null;
// Dos respuestas 401 seguidas (o dos pestañas) no deben crear dos altas a la vez: la segunda espera a la primera.
function pasoMfa() { return mfaEnCurso || (mfaEnCurso = pasoMfaUnico().finally(() => { mfaEnCurso = null; })); }
async function pasoMfaUnico() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { vista("vEntrar"); return mensaje("mEntrar", traducir(error.message)); }
  const verificado = (data.totp || []).find((f) => f.status === "verified");
  if (verificado) { factorMfa = verificado.id; return vista("vMfaCodigo"); }
  // Primera vez: se descartan altas a medias y se crea una nueva.
  for (const f of data.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const alta = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Panel Notaría 41" });
  if (alta.error) { vista("vEntrar"); return mensaje("mEntrar", traducir(alta.error.message)); }
  factorMfa = alta.data.id;
  $("#mfaQr").src = alta.data.totp.qr_code;
  $("#mfaClave").textContent = alta.data.totp.secret;
  vista("vMfaAlta");
}
async function verificarMfa(input, idMensaje) {
  const code = $(input).value.replace(/\D/g, "");
  if (code.length !== 6) return mensaje(idMensaje, "Escribe los 6 dígitos del código.");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factorMfa, code });
  if (error) return mensaje(idMensaje, /invalid|expired/i.test(error.message) ? "El código no es correcto o ya cambió. Escribe el que muestra la app ahora." : traducir(error.message));
  $(input).value = "";
  try { await mostrarApp(); } catch (err) { vista("vEntrar"); mensaje("mEntrar", err.message); }
}
$("#vMfaAlta").addEventListener("submit", (e) => { e.preventDefault(); ocupado(e.target, () => verificarMfa("#mfaCodigoAlta", "mMfaAlta")); });
$("#vMfaCodigo").addEventListener("submit", (e) => { e.preventDefault(); ocupado(e.target, () => verificarMfa("#mfaCodigo", "mMfaCodigo")); });

/* ---------- Cierre de sesión por inactividad ---------- */
const INACTIVIDAD_MS = 30 * 60 * 1000;
let ultimoUso = Date.now();
["pointerdown", "keydown", "scroll"].forEach((ev) => document.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true, capture: true }));
setInterval(async () => {
  if ($("#app").hidden && $("#agendaV").hidden && $("#preciosV").hidden) return;
  if (Date.now() - ultimoUso < INACTIVIDAD_MS) return;
  await sb.auth.signOut();
  vista("vEntrar");
  mensaje("mEntrar", "Cerramos tu sesión después de 30 minutos sin uso.", "info");
}, 60 * 1000);

async function mostrarApp() {
  try {
    await cargarLista();
  } catch (e) {
    if (e.sinPermiso) {
      const { data: { user } } = await sb.auth.getUser();
      $("#emailSinPermiso").textContent = user?.email || "";
      return vista("vSinPermiso");
    }
    if (e.mfa) return;
    throw e;
  }
  ultimoUso = Date.now();
  $("#acceso").hidden = true; $("#salir").hidden = false; $("#tabs").hidden = false;
  pestana(pestanaActual);
  clearInterval(timer);
  const refrescar = () => pestanaActual === "preciosV" ? Promise.resolve() : pestanaActual === "agendaV" ? cargarAgenda({ auto: true }) : Promise.all([cargarLista(), actual ? abrir(actual, true) : null]);
  timer = setInterval(() => refrescar().catch((e) => console.warn("No se pudo actualizar:", e.message)), 15000);
}

document.addEventListener("click", (e) => {
  const ir = e.target.closest("[data-ir]");
  if (ir) {
    if (ir.dataset.ir === "vRecuperar") $("#emailRec").value = $("#email").value;
    vista(ir.dataset.ir);
  }
  const ver = e.target.closest("[data-ver]");
  if (ver) { const i = $("#" + ver.dataset.ver); const oculto = i.type === "password"; i.type = oculto ? "text" : "password"; ver.textContent = oculto ? "Ocultar" : "Mostrar"; }
});

$("#vEntrar").addEventListener("submit", (e) => { e.preventDefault(); ocupado(e.target, async () => {
  const email = $("#email").value.trim(), password = $("#clave").value;
  if (!email || !password) return mensaje("mEntrar", "Escribe tu correo y tu contraseña.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return mensaje("mEntrar", traducir(error.message));
  $("#clave").value = "";
  try { await continuar(); } catch (err) { mensaje("mEntrar", err.message); }
}); });

$("#vRecuperar").addEventListener("submit", (e) => { e.preventDefault(); ocupado(e.target, async () => {
  const email = $("#emailRec").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return mensaje("mRecuperar", "Escribe un correo válido.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/panel/" });
  if (error && /rate limit/i.test(error.message)) return mensaje("mRecuperar", traducir(error.message));
  $("#emailEnviado").textContent = email;   // misma respuesta exista o no la cuenta
  vista("vEnviado");
}); });

$("#vDefinir").addEventListener("submit", (e) => { e.preventDefault(); ocupado(e.target, async () => {
  const c1 = $("#clave1").value, c2 = $("#clave2").value;
  if (c1.length < 8) return mensaje("mDefinir", "La contraseña debe tener al menos 8 caracteres.");
  if (c1 !== c2) return mensaje("mDefinir", "Las contraseñas no coinciden.");
  const { error } = await sb.auth.updateUser({ password: c1 });
  if (error) return /session/i.test(error.message) ? vista("vVencido") : mensaje("mDefinir", traducir(error.message));
  history.replaceState(null, "", location.pathname);
  try { await continuar(); } catch (err) { vista("vEntrar"); mensaje("mEntrar", err.message); }
}); });

$("#salir").onclick = async () => { await sb.auth.signOut(); vista("vEntrar"); };
$("#salirSinPermiso").onclick = async () => { await sb.auth.signOut(); vista("vEntrar"); };
document.querySelectorAll("[data-salir]").forEach((b) => { b.onclick = async () => { await sb.auth.signOut(); vista("vEntrar"); }; });

async function cargarLista() {
  const filas = await api("GET", { accion: "conversaciones" });
  $("#lista").innerHTML = filas.map((c) => `<button class="item${c.id === actual ? " on" : ""}" data-id="${esc(c.id)}">
    <b>${esc(c.canal === "web" ? (c.nombre || "Visitante de la web") : (c.nombre || c.telefono))} ${c.canal === "web" ? '<span class="tag">Web</span>' : ""} ${c.derivada ? '<span class="tag tag--der">Derivada</span>' : ""} ${c.citasPendientes ? `<span class="tag">${c.citasPendientes} cita</span>` : ""}</b>
    <small>${esc(c.ultimo)}</small></button>`).join("") || '<p class="vacio">Aún no hay conversaciones.</p>';
}
$("#lista").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) abrir(b.dataset.id); });

async function abrir(id, silencioso) {
  actual = id;
  const d = await api("GET", { accion: "detalle", id });
  const c = d.conversacion, abajo = $("#mensajes") && $("#mensajes").scrollTop + $("#mensajes").clientHeight >= $("#mensajes").scrollHeight - 30;
  if (silencioso && document.activeElement && document.activeElement.id === "texto") {
    $("#mensajes").innerHTML = mensajes(d); if (abajo) $("#mensajes").scrollTop = 1e9; return;
  }
  $("#detalle").innerHTML = `<div class="chat">
      <div class="top"><h2>${esc(c.nombre || (d.canal === "web" ? "Visitante de la web" : "Cliente"))}${d.canal === "web" ? " · Chat web" : " · " + esc(c.telefono)}</h2>
        ${c.derivada ? '<button class="btn btn--line" id="devolver">Devolver al asistente</button>' : '<span class="tag">Atiende el asistente</span>'}</div>
      <div id="mensajes">${mensajes(d)}</div>
      ${d.puedeResponder ? `<form class="resp" id="resp"><textarea id="texto" placeholder="Escribe tu respuesta…" required></textarea><button class="btn">Enviar</button></form>`
        : d.canal === "web" ? '<p class="aviso aviso-web">Conversación del chat de la página web: no se puede responder desde aquí. Si dejó su celular (ver citas), contáctalo por WhatsApp o teléfono.</p>'
        : '<p class="aviso aviso-web">Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no permite escribirle desde aquí. Llámalo por teléfono.</p>'}
    </div>
    <aside class="lado">
      <div><h3>Citas</h3>${d.citas.map((x) => `<div class="ficha"><b>${esc(x.tramite)}</b><span>${esc(x.fecha)} · ${esc(x.hora)}${x.codigo ? ` · Ticket ${esc(x.codigo)}` : ""} · ${esc(x.nombre)}</span>${x.contacto ? `<small>Celular: <a href="https://wa.me/${esc(x.contacto)}" target="_blank" rel="noopener">+${esc(x.contacto)}</a></small>` : ""}
        <span class="tag tag--inicio">${esc(x.estado)}</span>${x.nota ? `<small>${esc(x.nota)}</small>` : ""}
        <div class="acc">${x.estado === "pendiente" ? `<button class="btn" data-cita="${esc(x.id)}" data-estado="confirmada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Confirmar</button>
          <button class="btn btn--warn" data-cita="${esc(x.id)}" data-estado="rechazada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Rechazar</button>` : ""}
          ${x.estado === "confirmada" ? `<button class="btn btn--line" data-cita="${esc(x.id)}" data-estado="atendida">Marcar atendida</button>` : ""}</div></div>`).join("") || '<p class="aviso">Sin solicitudes de cita.</p>'}</div>
      <div><h3>Documentos</h3>${d.documentos.map((x) => `<div class="ficha"><b>${esc(x.descripcion)}</b><small>${esc(x.nombre)} ${x.tramite ? "· " + esc(x.tramite) : ""}</small>
        <span class="tag tag--inicio">${esc(x.estado || "recibido")}</span>${x.nota ? `<small>${esc(x.nota)}</small>` : ""}
        <div class="acc"><button class="btn btn--line" data-ver="${esc(x.id)}">Ver</button>
          <button class="btn" data-doc="${esc(x.id)}" data-estado="aprobado">Aprobar</button>
          <button class="btn btn--line" data-doc="${esc(x.id)}" data-estado="observado">Observar</button>
          <button class="btn btn--warn" data-borrar="${esc(x.id)}">Borrar</button></div></div>`).join("") || '<p class="aviso">Sin documentos.</p>'}</div>
    </aside>`;
  $("#mensajes").scrollTop = 1e9;
  cargarLista();
}

/* ---------- Agenda: repartir las citas del día ---------- */
const hoyQuito = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
function pestana(id) {
  pestanaActual = id;
  $("#preciosV").hidden = id !== "preciosV";
  if (id === "preciosV") cargarPreciosPanel();
  $("#app").hidden = id !== "app"; $("#agendaV").hidden = id !== "agendaV";
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  if (id === "agendaV") { if (!$("#agFecha").value) $("#agFecha").value = hoyQuito(); cargarAgenda(); cargarCitasConfig(); }
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) pestana(b.dataset.tab); });

let agendaPanel = null, filtroAgenda = "total";
const canalEtiqueta = (x) => ({ whatsapp: "WhatsApp", web: "Chat web", formulario: "Formulario" }[x.canal] || "");
const botonDetalle = (x) => x.canal === "formulario" ? "Ver detalle" : "Ver chat";
function telefonoCita(x) {
  const original = String(x.contacto || x.telefono || "");
  if (original.startsWith("web:")) return "";
  const numero = original.replace(/^form:/, "").replace(/\D/g, "");
  if (numero.length < 7) return "";
  // Celulares de Ecuador en formato local (099 999 9991); cualquier otro número (extranjero o fijo) completo con «+».
  const local = "0" + numero.slice(3);
  const texto = /^593\d{9}$/.test(numero) ? local.slice(0,3) + " " + local.slice(3,6) + " " + local.slice(6) : "+" + numero;
  return `<a href="https://wa.me/${esc(numero)}" target="_blank" rel="noopener">${esc(texto)}</a>`;
}
async function cargarAgenda(opciones = {}) {
  // El refresco automático no repinta mientras eligen a alguien o tienen el puntero sobre la lista.
  if (opciones.auto && (document.activeElement?.tagName === "SELECT" || $("#agLista").matches(":hover"))) return;
  const a = await api("GET", { accion: "agenda", fecha: $("#agFecha").value });
  const titulo = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(a.fecha + "T12:00:00Z"));
  const activas = a.citas.filter((x) => x.estado !== "rechazada").length;
  const texto = (a.fecha === hoyQuito() ? "Hoy, " : "") + titulo + ` · ${activas} cita${activas === 1 ? "" : "s"}`;
  $("#agTitulo").textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  agendaPanel = a;
  pintarAgenda();
}
function pintarAgenda() {
  const a = agendaPanel;
  const estados = { total: "Total", pendiente: "Pendientes", confirmada: "Confirmadas", atendida: "Atendidas", rechazada: "Canceladas" };
  $("#agResumen").innerHTML = Object.entries(estados).map(([k,v]) => `<button class="btn btn--line ${k === "pendiente" ? "ag-pendientes" : ""}" data-filtro-ag="${k}" aria-pressed="${filtroAgenda === k}">${v} <b>${k === "total" ? a.citas.length : a.citas.filter(x => k === "rechazada" ? ["rechazada", "cancelada"].includes(x.estado) : x.estado === k).length}</b></button>`).join("");
  const personas = a.personal.map((p) => p.nombre || p.email);
  const opcionesDe = (actual) => ['<option value="">Sin asignar</option>', ...[...new Set([...personas, actual].filter(Boolean))]
    .map((n) => `<option${n === actual ? " selected" : ""}>${esc(n)}</option>`)].join("");
  const ESTADO = { pendiente: '<span class="tag tag--pend">Pendiente</span>', confirmada: '<span class="tag">Confirmada</span>', atendida: '<span class="tag">Atendida</span>', rechazada: '<span class="tag">Cancelada</span>' };
  $("#agLista").innerHTML = a.citas.filter(x => filtroAgenda === "total" || (filtroAgenda === "rechazada" ? ["rechazada", "cancelada"].includes(x.estado) : x.estado === filtroAgenda)).map((x) => `<div class="ag-cita ag-cita--${esc(x.estado)}">
      <span class="ag-hora">${esc(x.hora)}${x.codigo ? `<small>Ticket ${esc(x.codigo)}</small>` : ""}</span>
      <div class="ag-cliente"><b>${esc(x.nombre)}</b><div class="ag-etiquetas">${ESTADO[x.estado] || '<span class="tag">Cancelada</span>'}${canalEtiqueta(x) ? `<span class="tag tag--canal">${canalEtiqueta(x)}</span>` : ""}</div><small>${[esc(x.tramite), telefonoCita(x), esc(x.nota)].filter(Boolean).join(" · ")}</small></div>
      ${["rechazada", "cancelada"].includes(x.estado) ? "<span></span>" : `<select data-asignar="${esc(x.id)}" aria-label="Asignar a">${opcionesDe(x.asignadaA)}</select>`}
      <div class="acc">${x.estado === "pendiente" ? `<button class="btn" data-cita="${esc(x.id)}" data-estado="confirmada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Confirmar</button><button class="btn btn--warn" data-cita="${esc(x.id)}" data-estado="rechazada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Rechazar</button>` : ""}
        ${x.estado === "confirmada" ? `<button class="btn btn--line" data-cita="${esc(x.id)}" data-estado="atendida">Atendida</button><button class="btn btn--warn" data-cita="${esc(x.id)}" data-estado="rechazada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Cancelar</button>` : ""}
        <button class="btn btn--line" data-chat="${esc(x.conversacionId)}">${botonDetalle(x)}</button></div>
    </div>`).join("") || `<p class="vacio">${a.citas.length ? 'No hay citas con este estado.' : 'No hay citas para este día. Puedes revisar otra fecha con las flechas.'}</p>`;
}
async function cargarCitasConfig() {
  try { pintarCitasConfig(await api("GET", { accion: "citasConfig" })); }
  catch { $("#agConfig").hidden = true; }
}
function pintarCitasConfig(c) {
  $("#agConfig").hidden = !c.esAdmin;
  if (!c.esAdmin) return;
  $("#agConfigContenido").innerHTML = `<form id="agCupo" class="config-fila"><label>Citas por hora<input name="porHora" type="number" min="1" max="20" required value="${esc(c.porHora)}"></label><button class="btn">Guardar</button><small>Valor oficial: ${esc(c.porHoraOficial)}</small></form>
    <ul class="bloqueos">${c.bloqueos.map(b => `<li><span>${esc(b.fecha)} · ${esc(b.hora || "Día completo")} · ${esc(b.motivo)}${b.fijo ? " · Feriado fijo" : ""}</span>${b.fijo ? "" : `<button class="btn btn--line" data-quitar-fecha="${esc(b.fecha)}" data-quitar-hora="${esc(b.hora || "")}">Quitar</button>`}</li>`).join("") || "<li>No hay bloqueos próximos.</li>"}</ul>
    <form id="agBloqueo" class="config-fila"><label>Fecha del bloqueo<input name="fecha" type="date" min="${hoyQuito()}" required></label><label>Hora (opcional)<select name="hora"><option value="">Día completo</option>${Array.from({length:24},(_,h) => `${String(h).padStart(2,"0")}:00`).map(h => `<option>${h}</option>`).join("")}</select></label><label>Motivo<input name="motivo" maxlength="80"></label><button class="btn">Agregar bloqueo</button></form>`;
}
async function guardarCitasConfig(pedido) {
  try { pintarCitasConfig(await api("POST", pedido)); $("#agConfigMensaje").textContent = "Guardado."; }
  catch (e) { $("#agConfigMensaje").textContent = e.message; }
}
$("#agConfig").addEventListener("submit", e => {
  e.preventDefault(); const datos = Object.fromEntries(new FormData(e.target));
  guardarCitasConfig(e.target.id === "agCupo" ? { accion: "guardarCupo", porHora: Number(datos.porHora) } : { accion: "agregarBloqueo", ...datos, hora: datos.hora || null });
});
$("#agConfig").addEventListener("click", e => {
  const b = e.target.closest("[data-quitar-fecha]");
  if (b) guardarCitasConfig({ accion: "quitarBloqueo", fecha: b.dataset.quitarFecha, hora: b.dataset.quitarHora || null });
});
// La búsqueda cruza días; sus resultados quedan junto a la agenda del día elegido.
let busquedaTicket = 0;
$("#agBuscar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codigo = $("#agTicket").value.trim();
  if (!/^[0-9]{4}$/.test(codigo)) { $("#agEstado").textContent = "Escribe un ticket de 4 dígitos."; return; }
  const turno = ++busquedaTicket;
  $("#agEstado").textContent = "Buscando…"; $("#agResultados").innerHTML = "";
  try {
    const r = await api("GET", { accion: "buscarTicket", codigo });
    if (turno !== busquedaTicket) return;
    const citas = Array.isArray(r) ? r : r.citas || [];
    $("#agEstado").textContent = citas.length ? "Citas encontradas: " + citas.length : "No hay citas activas con ese ticket.";
    $("#agResultados").innerHTML = citas.map((x) => `<div class="ficha"><b>${esc(x.fecha)} · ${esc(x.hora)} · Ticket ${esc(x.codigo)}</b><span>${esc(x.nombre)} · ${esc(x.tramite)} · ${esc(x.estado)}</span><small>${telefonoCita(x)}${canalEtiqueta(x) ? ` · ${canalEtiqueta(x)}` : ""}</small><div class="acc"><button type="button" class="btn btn--line" data-chat="${esc(x.conversacionId)}">${botonDetalle(x)}</button></div></div>`).join("");
  } catch (err) { if (turno === busquedaTicket) $("#agEstado").textContent = err.message; }
});
$("#agLimpiar").addEventListener("click", () => {
  busquedaTicket++; $("#agTicket").value = ""; $("#agEstado").textContent = ""; $("#agResultados").innerHTML = "";
});
$("#agFecha").addEventListener("change", () => cargarAgenda());
$("#agendaV").addEventListener("change", async (e) => {
  const s = e.target.closest("[data-asignar]"); if (!s) return;
  try { await api("POST", { accion: "asignarCita", id: s.dataset.asignar, persona: s.value }); s.blur(); } catch (err) { alert(err.message); }
});
$("#agendaV").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.filtroAg) { filtroAgenda = b.dataset.filtroAg; pintarAgenda(); return; }
    if (b.dataset.dia !== undefined) {
      const f = new Date(($("#agFecha").value || hoyQuito()) + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() + Number(b.dataset.dia));
      $("#agFecha").value = b.dataset.dia === "0" ? hoyQuito() : f.toISOString().slice(0, 10);
    } else if (b.dataset.chat) { pestana("app"); return abrir(b.dataset.chat); }
    else if (b.dataset.cita) {
      if (!confirmarContacto(b)) return;
      const motivo = b.dataset.estado === "rechazada" ? prompt("Motivo para el cliente (opcional):") : "";
      if (motivo === null) return;
      const r = await api("POST", { accion: "cita", id: b.dataset.cita, estado: b.dataset.estado, motivo });
      if (b.dataset.estado !== "atendida" && r.avisado === false) alert("La cita se actualizó, pero no se pudo avisar por WhatsApp. Llama al cliente.");
    } else return;
    await cargarAgenda();
  } catch (err) { alert(err.message); }
});

// El celular de una cita web lo escribió el visitante y nadie lo verificó: antes de escribirle, el personal lo confirma.
const confirmarContacto = (b) => !b.dataset.contacto ||
  confirm(`Este celular lo escribió el cliente en la página web y no está verificado: +${b.dataset.contacto}.\n\nSi confirmas, le llegará un aviso por WhatsApp. ¿Seguro que es el número del cliente?`);

function mensajes(d) {
  const nombres = { cliente: d.conversacion.nombre || "Cliente", asistente: "Asistente", personal: "Personal" };
  return d.mensajes.map((m) => `<div class="m m--${m.autor}"><small>${esc(nombres[m.autor])}</small>${esc(m.texto)}</div>`).join("") || '<p class="vacio">Sin mensajes.</p>';
}

$("#detalle").addEventListener("submit", async (e) => {
  if (e.target.id !== "resp") return;
  e.preventDefault();
  const texto = $("#texto").value.trim(); if (!texto) return;
  try { await api("POST", { accion: "responder", id: actual, texto }); await abrir(actual); } catch (err) { alert(err.message); }
});
$("#detalle").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.id === "devolver") await api("POST", { accion: "devolver", id: actual });
    else if (b.dataset.cita) {
      if (!confirmarContacto(b)) return;
      const motivo = b.dataset.estado === "rechazada" ? prompt("Motivo para el cliente (opcional):") || "" : "";
      const r = await api("POST", { accion: "cita", id: b.dataset.cita, estado: b.dataset.estado, motivo });
      if (b.dataset.estado !== "atendida" && r.avisado === false) alert("La cita se actualizó, pero no se pudo avisar por WhatsApp (pasaron más de 24 horas). Llama al cliente.");
    } else if (b.dataset.doc) {
      const nota = b.dataset.estado === "observado" ? prompt("¿Qué debe corregir el cliente?") : "";
      if (nota === null) return;
      await api("POST", { accion: "revisarDocumento", id: b.dataset.doc, estado: b.dataset.estado, nota });
    } else if (b.dataset.ver) { const { url } = await api("GET", { accion: "documento", id: b.dataset.ver }); if (!url) return alert("Este documento ya no está disponible."); window.open(url, "_blank", "noopener"); return; }
    else if (b.dataset.borrar) { if (!confirm("¿Borrar este documento? Desaparece del panel y se elimina definitivamente a los 7 días.")) return; await api("POST", { accion: "borrarDocumento", id: b.dataset.borrar }); }
    else return;
    await abrir(actual);
  } catch (err) { alert(err.message); }
});

/* ---------- Precios y SBU ---------- */
let preciosPanel = null;
const borradoresPrecio = new Map();
const ETIQUETA_VALOR = { pct: "Porcentaje del SBU (%)", fija: "Valor en dólares (USD)" };
// "2026-10-07T15:00:00Z" → "7 oct 2026, 10:00" (hora de Quito).
function fechaLegible(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month.replace(".", "")} ${p.year}, ${p.hour}:${p.minute}`;
}
const TIPOS_PRECIO = { pct: "Porcentaje del SBU", fija: "Valor fijo (USD)", cuantia: "Según cuantía", consultar: "Consultar" };
function finalPrecio(t, tarifas) {
  const r = calcularTarifa(t, tarifas);
  return r.total === null ? precioTexto(t, tarifas) : money(r.total) + " con IVA" + (t.tarifa.unidad ? " " + t.tarifa.unidad : "");
}
async function cargarPreciosPanel() {
  try {
    preciosPanel = await api("GET", { accion: "precios" });
    const T = preciosPanel.tarifas;
    $("#preciosAjustes").innerHTML = preciosPanel.esAdmin
      ? `<h3>Salario básico (SBU) y año</h3><label>SBU (USD)<input id="precioSbu" type="number" min="100" max="5000" step="any" value="${esc(T.sbu)}"></label><label>Año<input id="precioAnio" inputmode="numeric" maxlength="4" value="${esc(T.anio)}"></label><button class="btn" id="guardarSbu">Guardar SBU y año</button>${preciosPanel.sbuEditado ? `<p class="aviso-sbu">El SBU y el año se cambiaron aquí en el panel. La hoja de Google dice ${esc(money(preciosPanel.sbuOficial))} y ${esc(preciosPanel.anioOficial)}; mientras no vuelvas a ese valor, los cambios de la hoja no se ven. <button class="btn btn--line" id="restaurarSbu">Volver al SBU de la hoja</button></p>` : ""}`
      : `<p>SBU: ${esc(money(T.sbu))} · Año ${esc(T.anio)} · Solo lectura</p>`;
    pintarPrecios();
  } catch (e) { $("#preciosMensaje").textContent = e.message; }
}
function tarifasEnPantalla() {
  return { ...preciosPanel.tarifas, sbu: $("#precioSbu") ? Number($("#precioSbu").value) : preciosPanel.tarifas.sbu };
}
function pintarPrecios() {
  if (!preciosPanel) return;
  const buscar = $("#preciosBuscar").value.toLocaleLowerCase();
  let categoriaPrecio;
  $("#preciosLista").innerHTML = `<div class="precios-cabecera"><span>Trámite</span><span>Tipo</span><span>Valor</span><span>Unidad</span><span>Total con IVA</span><span>Acciones</span></div>` + preciosPanel.tramites.toSorted((a,b) => String(a.cat || "").localeCompare(String(b.cat || ""))).filter((t) => t.nombre.toLocaleLowerCase().includes(buscar) && (!$("#preciosEditados").checked || t.editada)).map((t) => {
    const f = borradoresPrecio.get(t.id) || t.tarifa;
    const campos = preciosPanel.esAdmin ? `<div class="precio-campos">
      <label><span class="rotulo">Tipo</span><select data-campo="tipo">${Object.entries(TIPOS_PRECIO).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="precio-valor"><label><span class="rotulo" data-etiqueta-valor>Valor</span><input data-campo="valor" type="number" step="any" min="0" value="${esc(f.tipo === "pct" ? +(f.valor * 100).toFixed(6) : f.valor ?? "")}"></label>
      <label><span class="rotulo">Tabla</span><select data-campo="tabla">${Object.keys(preciosPanel.tarifas.tablas || {}).map((k) => `<option value="${esc(k)}" ${f.tabla === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
      </div><label><span class="rotulo">Unidad</span><input data-campo="unidad" placeholder="Por firma (opcional)" maxlength="30" value="${esc(f.unidad)}"></label><output aria-live="polite">${esc(finalPrecio(t, tarifasEnPantalla()))}</output><div class="precio-acciones"><button class="btn" disabled data-precio="guardar">Guardar</button><button class="btn btn--line" data-precio="restaurar">Volver al valor oficial</button></div></div>` : `<div class="precio-consulta"><span>${esc(TIPOS_PRECIO[f.tipo])}</span><span>${esc(f.tipo === "pct" ? +(f.valor * 100).toFixed(6) + " %" : f.valor ?? "—")}</span><span>${esc(f.unidad || "—")}</span><output>${esc(finalPrecio(t, tarifasEnPantalla()))}</output><span>Solo lectura</span></div>`;
    return `${(t.cat || "Otros trámites") !== categoriaPrecio ? `<h3 class="precio-categoria">${esc(categoriaPrecio = t.cat || "Otros trámites")}</h3>` : ""}<article class="precio-fila" data-tramite="${esc(t.id)}"><div class="precio-nombre"><h3>${esc(t.nombre)}</h3><small>${t.editada ? `Editado por ${esc(t.actualizadoPor)} el ${esc(fechaLegible(t.actualizadoEn))}` : "Valor oficial"}</small><span class="precio-pendiente" hidden>Cambios sin guardar</span></div>${campos}</article>`;
  }).join("") || "<p>No hay trámites con ese nombre.</p>";
  if (!$("#preciosLista .precio-fila")) $("#preciosLista").insertAdjacentHTML("beforeend", "<p>No hay trámites con estos filtros.</p>");
  document.querySelectorAll(".precio-fila").forEach(actualizarPrecio);
}
function precioDeFila(fila) {
  const campo = (k) => fila.querySelector(`[data-campo="${k}"]`).value;
  const tipo = campo("tipo");
  return { tramiteId: fila.dataset.tramite, tipo, valor: tipo === "pct" ? Number(campo("valor")) / 100 : Number(campo("valor")), unidad: campo("unidad"), tabla: campo("tabla") };
}
function actualizarPrecio(fila) {
  if (!preciosPanel.esAdmin) return;
  const p = precioDeFila(fila);
  fila.querySelector('[data-campo="valor"]').disabled = !["pct", "fija"].includes(p.tipo);
  fila.querySelector('[data-campo="tabla"]').disabled = p.tipo !== "cuantia";
  // Solo se muestra lo que aplica al tipo elegido, y el valor dice si son % del SBU o dólares.
  fila.querySelector('[data-campo="tabla"]').closest("label").hidden = p.tipo !== "cuantia";
  fila.querySelector("[data-etiqueta-valor]").textContent = ETIQUETA_VALOR[p.tipo] || "Valor";
  const original = preciosPanel.tramites.find(t => t.id === fila.dataset.tramite).tarifa;
  const cambiado = p.tipo !== original.tipo || p.unidad !== (original.unidad || "") || (["pct", "fija"].includes(p.tipo) && Math.abs(p.valor - Number(original.valor)) > 1e-10) || (p.tipo === "cuantia" && p.tabla !== original.tabla);
  fila.classList.toggle("precio-fila--cambiada", cambiado);
  fila.querySelector(".precio-pendiente").hidden = !cambiado;
  fila.querySelector('[data-precio="guardar"]').disabled = !cambiado;
  if (cambiado) borradoresPrecio.set(fila.dataset.tramite, p); else borradoresPrecio.delete(fila.dataset.tramite);
  fila.querySelector("output").textContent = finalPrecio({ tarifa: p }, tarifasEnPantalla());
}
$("#preciosEditados").addEventListener("change", pintarPrecios);
$("#preciosBuscar").addEventListener("input", pintarPrecios);
$("#preciosV").addEventListener("input", (e) => {
  const fila = e.target.closest(".precio-fila");
  if (fila) actualizarPrecio(fila);
  if (e.target.id === "precioSbu") document.querySelectorAll(".precio-fila").forEach(actualizarPrecio);
});
$("#preciosV").addEventListener("change", (e) => { const fila = e.target.closest(".precio-fila"); if (fila) actualizarPrecio(fila); });
$("#preciosV").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || !preciosPanel?.esAdmin || !(b.id || b.dataset.precio)) return;
  try {
    let pedido;
    if (b.id === "guardarSbu") {
      const sbu = Number($("#precioSbu").value), anio = $("#precioAnio").value;
      if (!confirm(`Antes → Después\nSBU: ${preciosPanel.tarifas.sbu} → ${sbu}\nAño: ${preciosPanel.tarifas.anio} → ${anio}`)) return;
      pedido = { accion: "guardarSBU", sbu, anio };
    } else if (b.id === "restaurarSbu") {
      if (!confirm("¿Volver al SBU y al año de la hoja de Google?")) return;
      pedido = { accion: "restaurarSBU" };
    } else {
      const fila = b.closest(".precio-fila"), p = precioDeFila(fila);
      if (b.dataset.precio === "restaurar") {
        if (!confirm("¿Volver al valor oficial de este trámite?")) return;
        pedido = { accion: "restaurarPrecio", tramiteId: p.tramiteId };
      } else {
        const anterior = preciosPanel.tramites.find((t) => t.id === p.tramiteId);
        if (!confirm(`Antes → Después\n${anterior.nombre}\n${finalPrecio(anterior, preciosPanel.tarifas)} → ${finalPrecio({ tarifa: p }, preciosPanel.tarifas)}`)) return;
        pedido = { accion: "guardarPrecio", ...p };
      }
    }
    b.disabled = true;
    await api("POST", pedido);
    if (pedido.tramiteId) borradoresPrecio.delete(pedido.tramiteId);
    $("#preciosMensaje").textContent = "Guardado. La web lo muestra en 1 minuto y Sofía en hasta 5; una conversación ya abierta con Sofía puede seguir citando el valor anterior.";
    await cargarPreciosPanel();
  } catch (err) { $("#preciosMensaje").textContent = err.message; }
  finally { if (b.isConnected && b.closest(".precio-fila")) actualizarPrecio(b.closest(".precio-fila")); else b.disabled = false; }
});

const { data: { session } } = await sb.auth.getSession();
if (errorEnlace) {
  history.replaceState(null, "", location.pathname);
  vista("vVencido");
} else if (tipoEnlace === "invite" || tipoEnlace === "recovery") {
  if (!session) vista("vVencido");
  else {
    $("#tDefinir").textContent = tipoEnlace === "invite" ? "Bienvenido. Crea tu contraseña" : "Crea una nueva contraseña";
    $("#sDefinir").textContent = tipoEnlace === "invite" ? "Es la que usarás para entrar al panel de la notaría." : "Después entrarás directamente al panel.";
    $("#cuentaDefinir").textContent = session.user.email;
    vista("vDefinir");
  }
} else if (session) continuar().catch(() => vista("vEntrar"));
else vista("vEntrar");
