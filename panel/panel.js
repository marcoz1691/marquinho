import { precioTexto, calcularTarifa, money } from "../js/nucleo.js";

// Panel del personal. La librería de Supabase llega desde vendor/ (ver index.html).
const { createClient } = window.supabase;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Lo que trae el enlace del correo, leído antes de que la librería limpie la URL.
const enlace = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
const tipoEnlace = enlace.get("type");               // invite | recovery
const errorEnlace = enlace.get("error_code") || enlace.get("error");
const cfg = await fetch("/api/panel-config").then((r) => r.json()).catch(() => null);
if (!cfg) { $("#cargando span").textContent = "No pudimos abrir el panel. Revisa tu conexión y recarga la página."; throw new Error("Sin configuración del panel"); }
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
  if (verComo) opts.headers["X-Ver-Como"] = verComo;
  let url = "/api/panel";
  if (metodo === "GET") url += "?" + new URLSearchParams(params); else opts.body = JSON.stringify(params);
  const r = await fetch(url, opts), data = await r.json();
  if (r.status === 401) { if (data.mfa) await pasoMfa(); else vista("vEntrar"); throw Object.assign(new Error(data.error), { mfa: !!data.mfa }); }
  if (r.status === 403) { const e = new Error(data.error); e.sinPermiso = true; throw e; }
  if (!r.ok) throw new Error(data.error);
  return data;
}

/* ---------- Ver como: el administrador revisa el panel con otro perfil ---------- */
// Es una vista previa de su propia sesión: el servidor calcula los permisos con ese perfil y rechaza todo cambio.
const VER_COMO = "panel.verComo";
let verComo = (() => { try { return sessionStorage.getItem(VER_COMO) || ""; } catch { return ""; } })();
function guardarVerComo(rol) {
  verComo = ["notario", "personal"].includes(rol) ? rol : "";
  try { if (verComo) sessionStorage.setItem(VER_COMO, verComo); else sessionStorage.removeItem(VER_COMO); } catch {}
}
const selectorVerComo = Object.assign(document.createElement("label"), { className: "ver-como", hidden: true,
  innerHTML: '<span>Ver como</span><select id="verComo"><option value="">Administrador</option><option value="notario">Notario</option><option value="personal">Personal</option></select>' });
const avisoVerComo = Object.assign(document.createElement("div"), { className: "vista-previa", id: "vistaPrevia", hidden: true,
  innerHTML: '<p role="status"></p><button type="button" class="btn btn--line">Volver a Administrador</button>' });
$("#perfilSesion").after(selectorVerComo);
$("header").after(avisoVerComo);
// Alto real del encabezado y del aviso de vista previa: las vistas de pantalla completa lo restan (cambia en el celular).
const medirCabecera = () => document.documentElement.style.setProperty("--alto-cab", ($("header").offsetHeight + (avisoVerComo.hidden ? 0 : avisoVerComo.offsetHeight)) + "px");
if ("ResizeObserver" in window) { const ro = new ResizeObserver(medirCabecera); ro.observe($("header")); ro.observe(avisoVerComo); }
addEventListener("resize", medirCabecera);
medirCabecera();
// Con la respuesta de «yo»: el selector solo aparece si la cuenta es de administrador. Si el servidor no aceptó la vista
// previa (la cuenta ya no es administradora), se olvida.
function pintarVerComo(yo) {
  if (!yo.vistaPrevia) guardarVerComo("");
  selectorVerComo.hidden = !yo.vistaPrevia && yo.rol !== "admin";
  $("#verComo").value = verComo;
  avisoVerComo.hidden = !verComo;
  medirCabecera();
  avisoVerComo.querySelector("p").textContent = verComo ? `Estás viendo el panel como ${perfiles[verComo]}. Es solo una vista previa: no se guardan cambios.` : "";
}
async function cambiarVerComo(rol) {
  guardarVerComo(rol);
  try { await mostrarApp(); } catch (e) { console.warn("No se pudo cambiar la vista:", e.message); }
}
$("#verComo").addEventListener("change", (e) => cambiarVerComo(e.target.value));
avisoVerComo.querySelector("button").addEventListener("click", () => cambiarVerComo(""));
document.querySelectorAll("#salir, #salirSinPermiso, [data-salir]").forEach((b) => b.addEventListener("click", () => guardarVerComo("")));

// Solo una pantalla visible a la vez.
function vista(id) {
  clearInterval(timer);
  $("#cargando").hidden = true;
  $("#equipoV").hidden = true; $("#perfilSesion").hidden = true; $("#funcionesV").hidden = true; $("#metricasV").hidden = true;
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

let rolSesion = null;
const perfiles = { admin: "Administrador", notario: "Notario", personal: "Personal" };
async function mostrarApp() {
  try {
    // El perfil y las conversaciones se piden a la vez: el panel aparece completo de una sola vez.
    const [yo] = await Promise.all([api("GET", { accion: "yo" }), cargarLista()]);
    rolSesion = yo.rol;
    pintarVerComo(yo);
    $("#perfilSesion").textContent = perfiles[rolSesion] || "";
    $("#perfilSesion").hidden = false;
    $("[data-tab=funcionesV]").hidden = rolSesion !== "admin";
    $("[data-tab=metricasV]").hidden = rolSesion !== "admin";
    $("[data-tab=equipoV]").hidden = !["admin", "notario"].includes(rolSesion);
    if ((["funcionesV", "metricasV"].includes(pestanaActual) && rolSesion !== "admin") || (pestanaActual === "equipoV" && !["admin", "notario"].includes(rolSesion))) pestanaActual = "app";
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
  $("#cargando").hidden = true; $("#acceso").hidden = true; $("#salir").hidden = false; $("#tabs").hidden = false;
  pestana(pestanaActual);
  if (rolSesion === "admin") cargarMetricas(true);
  clearInterval(timer);
  const refrescar = () => ["preciosV", "funcionesV", "metricasV", "equipoV"].includes(pestanaActual) ? Promise.resolve() : pestanaActual === "agendaV" ? cargarAgenda({ auto: true }) : Promise.all([cargarLista(), actual ? abrir(actual, true) : null]);
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
$("#detalle").addEventListener("click", (e) => {
  if (e.target.closest("[data-volver]")) { document.body.classList.remove("conv-abierta", "ver-lado"); return; }
  if (e.target.closest("[data-lado]")) document.body.classList.toggle("ver-lado");
});

async function abrir(id, silencioso) {
  actual = id;
  const d = await api("GET", { accion: "detalle", id });
  const c = d.conversacion, abajo = $("#mensajes") && $("#mensajes").scrollTop + $("#mensajes").clientHeight >= $("#mensajes").scrollHeight - 30;
  if (silencioso && document.activeElement && document.activeElement.id === "texto") {
    $("#mensajes").innerHTML = mensajes(d); if (abajo) $("#mensajes").scrollTop = 1e9; return;
  }
  // En el celular la conversación ocupa la pantalla: se vuelve a la lista con «‹» y las citas y documentos salen en una hoja.
  if (!silencioso) document.body.classList.add("conv-abierta");
  const extras = d.citas.length + d.documentos.length;
  $("#detalle").innerHTML = `<div class="chat">
      <div class="top"><button class="volver" type="button" data-volver aria-label="Volver a las conversaciones">‹</button><h2>${esc(c.nombre || (d.canal === "web" ? "Visitante de la web" : "Cliente"))}${d.canal === "web" ? " · Chat web" : " · " + esc(c.telefono)}</h2>
        ${c.derivada ? '<button class="btn btn--line" id="devolver">Devolver al asistente</button>' : '<span class="tag">Atiende el asistente</span>'}
        <button class="btn btn--line ver-lado-btn" type="button" data-lado aria-controls="lado">Citas y documentos${extras ? ` (${extras})` : ""}</button></div>
      <div id="mensajes">${mensajes(d)}</div>
      ${d.puedeResponder ? `<form class="resp" id="resp"><textarea id="texto" placeholder="Escribe tu respuesta…" required></textarea><button class="btn">Enviar</button></form>`
        : d.canal === "web" ? '<p class="aviso aviso-web">Conversación del chat de la página web: no se puede responder desde aquí. Si dejó su celular (ver citas), contáctalo por WhatsApp o teléfono.</p>'
        : '<p class="aviso aviso-web">Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no permite escribirle desde aquí. Llámalo por teléfono.</p>'}
    </div>
    <aside class="lado" id="lado">
      <button class="btn btn--line cerrar-lado" type="button" data-lado>Cerrar</button>
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
  $("#equipoV").hidden = id !== "equipoV";
  if (id === "equipoV") cargarEquipo();
  $("#funcionesV").hidden = id !== "funcionesV";
  $("#metricasV").hidden = id !== "metricasV";
  if (id === "funcionesV") cargarFuncionesPanel();
  if (id === "metricasV") cargarMetricas();
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
      const observacionCliente = b.dataset.estado === "observado" ? prompt("Mensaje que verá el cliente: ¿qué debe corregir?") : "";
      if (observacionCliente === null) return;
      await api("POST", { accion: "revisarDocumento", id: b.dataset.doc, estado: b.dataset.estado, nota: "", observacionCliente });
    } else if (b.dataset.ver) { const { url } = await api("GET", { accion: "documento", id: b.dataset.ver }); if (!url) return alert("Este documento ya no está disponible."); window.open(url, "_blank", "noopener"); return; }
    else if (b.dataset.borrar) { if (!confirm("¿Borrar este documento? Desaparece del panel y se elimina definitivamente a los 7 días.")) return; await api("POST", { accion: "borrarDocumento", id: b.dataset.borrar }); }
    else return;
    await abrir(actual);
  } catch (err) { alert(err.message); }
});

/* ---------- Precios y SBU ---------- */
let preciosPanel = null;
const borradoresPrecio = new Map();
// Texto del trámite (nombre, descripción, requisitos, pasos y nota): un editor abierto a la vez y su borrador.
let editandoTexto = null;
// En el celular los campos de precio de cada trámite se abren con «Editar precio»: la lista queda corta.
const preciosAbiertos = new Set();
const borradoresTexto = new Map();
const LAPIZ = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
function editorTexto(t) {
  const x = borradoresTexto.get(t.id) || { nombre: t.nombre, desc: t.desc || "", req: (t.req || []).join("\n"), pasos: (t.pasos || []).join("\n"), nota: t.nota || "" };
  return `<form class="texto-editor" data-texto-form novalidate>
    <div class="campo"><label for="tx-nombre">Nombre</label><input id="tx-nombre" name="nombre" maxlength="120" required value="${esc(x.nombre)}"></div>
    <div class="campo"><label for="tx-desc">Descripción</label><textarea id="tx-desc" name="desc" rows="2" maxlength="500">${esc(x.desc)}</textarea></div>
    <div class="texto-columnas">
      <div class="campo"><label for="tx-req">Requisitos</label><textarea id="tx-req" name="req" rows="6">${esc(x.req)}</textarea><small>Uno por línea.</small></div>
      <div class="campo"><label for="tx-pasos">Cómo es el trámite</label><textarea id="tx-pasos" name="pasos" rows="6">${esc(x.pasos)}</textarea><small>Un paso por línea.</small></div>
    </div>
    <div class="campo"><label for="tx-nota">Nota</label><textarea id="tx-nota" name="nota" rows="2" maxlength="500">${esc(x.nota)}</textarea><small>Opcional. Aparece debajo de los requisitos.</small></div>
    <div class="texto-acciones"><button class="btn" type="submit">Guardar texto</button><button class="btn btn--line" type="button" data-texto="cerrar">Cancelar</button>${t.textoEditado ? '<button class="btn btn--line" type="button" data-texto="restaurar">Volver al texto de la hoja</button>' : ""}</div>
  </form>`;
}
const textoDeForm = (form) => { const d = Object.fromEntries(new FormData(form)); return { nombre: d.nombre, desc: d.desc, req: d.req, pasos: d.pasos, nota: d.nota }; };
const lineas = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
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
  $("#preciosLista").innerHTML = `<div class="precios-cabecera"><span>Trámite</span><span>Tipo</span><span>Valor</span><span>Unidad</span><span>Total con IVA</span><span>Acciones</span></div>` + preciosPanel.tramites.toSorted((a,b) => String(a.cat || "").localeCompare(String(b.cat || ""))).filter((t) => t.nombre.toLocaleLowerCase().includes(buscar) && (!$("#preciosEditados").checked || t.editada || t.textoEditado)).map((t) => {
    const f = borradoresPrecio.get(t.id) || t.tarifa;
    const campos = preciosPanel.esAdmin ? `<div class="precio-campos">
      <label><span class="rotulo">Tipo</span><select data-campo="tipo">${Object.entries(TIPOS_PRECIO).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="precio-valor"><label><span class="rotulo" data-etiqueta-valor>Valor</span><input data-campo="valor" type="number" step="any" min="0" value="${esc(f.tipo === "pct" ? +(f.valor * 100).toFixed(6) : f.valor ?? "")}"></label>
      <label><span class="rotulo">Tabla</span><select data-campo="tabla">${Object.keys(preciosPanel.tarifas.tablas || {}).map((k) => `<option value="${esc(k)}" ${f.tabla === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
      </div><label><span class="rotulo">Unidad</span><input data-campo="unidad" placeholder="Ej.: por firma" maxlength="30" value="${esc(f.unidad)}"></label><output aria-live="polite">${esc(finalPrecio(t, tarifasEnPantalla()))}</output><div class="precio-acciones"><button class="btn" disabled data-precio="guardar">Guardar</button><button class="btn btn--line" data-precio="restaurar">Volver al valor oficial</button></div></div>` : `<div class="precio-consulta"><span>${esc(TIPOS_PRECIO[f.tipo])}</span><span>${esc(f.tipo === "pct" ? +(f.valor * 100).toFixed(6) + " %" : f.valor ?? "—")}</span><span>${esc(f.unidad || "—")}</span><output>${esc(finalPrecio(t, tarifasEnPantalla()))}</output><span>Solo lectura</span></div>`;
    return `${(t.cat || "Otros trámites") !== categoriaPrecio ? `<h3 class="precio-categoria">${esc(categoriaPrecio = t.cat || "Otros trámites")}</h3>` : ""}<article class="precio-fila${editandoTexto === t.id ? " precio-fila--editando" : ""}${preciosAbiertos.has(t.id) ? " precio-fila--abierta" : ""}" data-tramite="${esc(t.id)}"><div class="precio-nombre"><div class="precio-titulo"><h3>${esc(t.nombre)}</h3>${preciosPanel.esAdmin ? `<button class="lapiz" type="button" data-texto="abrir" aria-expanded="${editandoTexto === t.id}" aria-label="Editar el texto de ${esc(t.nombre)}" title="Editar nombre, descripción y requisitos">${LAPIZ}</button>` : ""}</div><small>${t.editada ? `Precio editado por ${esc(t.actualizadoPor)} el ${esc(fechaLegible(t.actualizadoEn))}` : "Precio oficial"}</small>${t.textoEditado ? `<small class="texto-estado">Texto editado por ${esc(t.textoPor)} el ${esc(fechaLegible(t.textoEn))}</small>` : ""}<span class="precio-pendiente" hidden>Cambios sin guardar</span>${preciosPanel.esAdmin ? `<button class="btn btn--line abrir-precio" type="button" data-abrir-precio aria-expanded="${preciosAbiertos.has(t.id)}">${preciosAbiertos.has(t.id) ? "Ocultar precio" : "Editar precio"}</button>` : ""}</div>${campos}${editandoTexto === t.id ? editorTexto(t) : ""}</article>`;
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
  fila.querySelector('[data-campo="valor"]').closest("label").hidden = !["pct", "fija"].includes(p.tipo);
  fila.querySelector("[data-etiqueta-valor]").textContent = ETIQUETA_VALOR[p.tipo] || "Valor";
  const original = preciosPanel.tramites.find(t => t.id === fila.dataset.tramite).tarifa;
  const cambiado = p.tipo !== original.tipo || p.unidad !== (original.unidad || "") || (["pct", "fija"].includes(p.tipo) && Math.abs(p.valor - Number(original.valor)) > 1e-10) || (p.tipo === "cuantia" && p.tabla !== original.tabla);
  fila.classList.toggle("precio-fila--cambiada", cambiado);
  fila.querySelector(".precio-pendiente").hidden = !cambiado;
  fila.querySelector('[data-precio="guardar"]').disabled = !cambiado;
  if (cambiado) borradoresPrecio.set(fila.dataset.tramite, p); else borradoresPrecio.delete(fila.dataset.tramite);
  fila.querySelector("output").textContent = finalPrecio({ tarifa: p }, tarifasEnPantalla());
}
$("#preciosV").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-texto]");
  if (!b || !preciosPanel?.esAdmin) return;
  const id = b.closest(".precio-fila").dataset.tramite;
  if (b.dataset.texto === "abrir") { editandoTexto = editandoTexto === id ? null : id; pintarPrecios(); if (editandoTexto) $("#tx-nombre")?.focus(); return; }
  if (b.dataset.texto === "cerrar") { editandoTexto = null; borradoresTexto.delete(id); return pintarPrecios(); }
  if (b.dataset.texto === "restaurar") {
    if (!confirm("¿Volver al texto de la hoja de Google para este trámite?")) return;
    b.disabled = true;
    try {
      await api("POST", { accion: "restaurarTexto", tramiteId: id });
      editandoTexto = null; borradoresTexto.delete(id);
      $("#preciosMensaje").textContent = "Listo. El trámite vuelve a mostrar el texto de la hoja (en la web en 1 minuto y en Sofía en hasta 5).";
      await cargarPreciosPanel();
    } catch (err) { $("#preciosMensaje").textContent = err.message; b.disabled = false; }
  }
});
$("#preciosV").addEventListener("click", (e) => {
  const b = e.target.closest("[data-abrir-precio]");
  if (!b) return;
  const fila = b.closest(".precio-fila"), id = fila.dataset.tramite, abierta = !preciosAbiertos.has(id);
  if (abierta) preciosAbiertos.add(id); else preciosAbiertos.delete(id);
  fila.classList.toggle("precio-fila--abierta", abierta);
  b.setAttribute("aria-expanded", abierta); b.textContent = abierta ? "Ocultar precio" : "Editar precio";
});
$("#preciosV").addEventListener("input", (e) => {
  const form = e.target.closest("[data-texto-form]");
  if (form) borradoresTexto.set(form.closest(".precio-fila").dataset.tramite, textoDeForm(form));
});
$("#preciosV").addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-texto-form]");
  if (!form) return;
  e.preventDefault();
  const id = form.closest(".precio-fila").dataset.tramite, x = textoDeForm(form), boton = form.querySelector('[type="submit"]');
  if (x.nombre.trim().length < 3) { $("#preciosMensaje").textContent = "El nombre debe tener al menos 3 caracteres."; return $("#tx-nombre").focus(); }
  boton.disabled = true;
  try {
    await api("POST", { accion: "guardarTexto", tramiteId: id, nombre: x.nombre, desc: x.desc, req: lineas(x.req), pasos: lineas(x.pasos), nota: x.nota });
    editandoTexto = null; borradoresTexto.delete(id);
    $("#preciosMensaje").textContent = "Guardado. La web lo muestra en 1 minuto y Sofía en hasta 5.";
    await cargarPreciosPanel();
  } catch (err) { $("#preciosMensaje").textContent = err.message; boton.disabled = false; }
});
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

/* ---------- Funciones y métricas del piloto ---------- */
let funcionesPanel = null, metricasPanel = null;
function pintarFunciones(d) {
  funcionesPanel = d;
  $("#funcionesLista").innerHTML = (d.funciones || []).map(f => `<article class="funcion-card${f.activa ? "" : " funcion-card--apagada"}"><h3>${esc(f.nombre)}</h3><p>${esc(f.descripcion)}</p>${d.esAdmin ? `<button class="interruptor" type="button" role="switch" aria-label="${esc(f.nombre)}" aria-checked="${!!f.activa}" data-funcion-id="${esc(f.id)}"><span class="interruptor__pista" aria-hidden="true"><span class="interruptor__perilla"></span></span><span class="interruptor__texto">${f.activa ? "Encendida" : "Apagada"}</span></button>` : `<strong class="funcion-estado">${f.activa ? "Encendida" : "Apagada"}</strong>`}${f.actualizadoEn ? `<p>Cambiado por ${esc(f.actualizadoPor)} el ${esc(fechaLegible(f.actualizadoEn))}</p>` : ""}</article>`).join("");
}
async function cargarFuncionesPanel() {
  try { pintarFunciones(await api("GET", { accion: "funciones" })); }
  catch (e) { $("#funcionesMensaje").textContent = e.message; }
}
$("#funcionesLista").addEventListener("click", async e => {
  const b = e.target.closest("[data-funcion-id]");
  if (!b || !funcionesPanel?.esAdmin) return;
  const f = funcionesPanel.funciones.find(f => f.id === b.dataset.funcionId);
  if (f.activa && !confirm((f.id === "sitio" ? "El público dejará de ver la página. " : "") + f.efectoAlApagar)) return;
  b.disabled = true;
  try {
    pintarFunciones(await api("POST", { accion: "guardarFuncion", id: f.id, activa: !f.activa }));
    $("#funcionesMensaje").textContent = "Listo. El sitio puede tardar hasta 1 minuto en reflejar el cambio.";
    $("#funcionesLista").querySelector(`[data-funcion-id="${f.id}"]`)?.focus();
  } catch (e) { $("#funcionesMensaje").textContent = e.message; }
  finally { b.disabled = false; }
});
const monedaMetricas = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
const canalesMetricas = ["whatsapp", "web", "formulario"];
const sumaCanales = (t, clave) => canalesMetricas.reduce((s,c) => s + Number(t[clave + "." + c] || 0), 0);
const preciosMetricas = { entrada: "Entrada (USD por millón de tokens)", salida: "Salida (USD por millón de tokens)", cacheLectura: "Lectura de caché (USD por millón de tokens)", cacheEscritura: "Escritura de caché (USD por millón de tokens)", plantillaWhatsapp: "Plantilla de WhatsApp (USD por mensaje)" };
function rangoMetricas() {
  const hasta = hoyQuito(), desde = new Date(hasta + "T12:00:00Z");
  if ($("#metricasPeriodo").value === "piloto") return { desde: metricasPanel.pilotoInicio, hasta };
  desde.setUTCDate(desde.getUTCDate() - Number($("#metricasPeriodo").value) + 1);
  return { desde: desde.toISOString().slice(0,10), hasta };
}
let lecturaMetricas = 0;
async function cargarMetricas(inicial = false) {
  const lectura = ++lecturaMetricas;
  try {
    const d = await api("GET", { accion: "metricas", ...rangoMetricas() });
    if (lectura !== lecturaMetricas) return;
    $("[data-tab=metricasV]").hidden = false;
    pintarMetricas(d);
  } catch (e) {
    if (e.sinPermiso) { $("[data-tab=metricasV]").hidden = true; if (pestanaActual === "metricasV") pestana("app"); }
    else if (!inicial) $("#metricasMensaje").textContent = e.message;
  }
}
function pintarMetricas(d) {
  metricasPanel = d;
  const t = d.totales || {}, conv = sumaCanales(t,"conv.nueva"), derivadas = sumaCanales(t,"conv.derivada"), atendidas = Number(t["cita.atendida"] || 0), faltas = Number(t["cita.inasistencia"] || 0);
  const porCanal = k => canalesMetricas.map(c => `${c === "whatsapp" ? "WhatsApp" : c === "web" ? "Web" : "Formulario"}: ${Number(t[k + "." + c] || 0)}`).join(" · ");
  const pct = n => (n * 100).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
  const tarjeta = (nombre, valor, detalle = "") => `<article class="funcion-card"><h3>${esc(nombre)}</h3><strong class="metrica-numero">${esc(valor)}</strong><p>${esc(detalle)}</p></article>`;
  $("#metricasTarjetas").innerHTML = tarjeta("Conversaciones",conv,porCanal("conv.nueva")) + tarjeta("Mensajes de clientes",sumaCanales(t,"msg.cliente")) + tarjeta("Resueltas sin persona",pct(conv ? Math.max(0, 1 - derivadas / conv) : 0)) + tarjeta("Citas",sumaCanales(t,"cita.creada"),porCanal("cita.creada")) + tarjeta("Tasa de inasistencia",pct(atendidas + faltas ? faltas / (atendidas + faltas) : 0)) + tarjeta("Recordatorios enviados", t["recordatorio.enviado"] || 0) + tarjeta("Documentos recibidos",sumaCanales(t,"doc.recibido")) + tarjeta("Costo estimado",monedaMetricas.format(d.costo.total),`IA: ${monedaMetricas.format(d.costo.ia)} · WhatsApp: ${monedaMetricas.format(d.costo.whatsapp)} · Por conversación: ${monedaMetricas.format(d.costo.porConversacion)}. Estimación con los precios configurados`);
  $("#metricasRango").textContent = `${d.desde} a ${d.hasta}`;
  $("#inicioPiloto").value = d.pilotoInicio || "";
  $("#metricasPeriodo option[value=piloto]").disabled = !d.pilotoInicio;
  $("#metricasPrecios").innerHTML = Object.entries(preciosMetricas).map(([k,v]) => `<label for="metricaPrecio-${k}">${esc(v)}</label><input id="metricaPrecio-${k}" name="${k}" type="number" min="0" max="1000" step="any" required value="${esc(d.precios[k])}">`).join("") + '<button class="btn">Guardar</button>';
  const semanas = new Map();
  for (const dia of d.porDia || []) {
    const fecha = new Date(dia.fecha + "T12:00:00Z"); fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7);
    const lunes = fecha.toISOString().slice(0,10), valores = dia.valores || {}, s = semanas.get(lunes) || { conv: 0, citas: 0, costo: 0 };
    s.conv += sumaCanales(valores,"conv.nueva"); s.citas += sumaCanales(valores,"cita.creada");
    for (const [clave,precio] of [["entrada","entrada"],["salida","salida"],["cache_lectura","cacheLectura"],["cache_escritura","cacheEscritura"]]) s.costo += Number(valores["ia.tokens_" + clave] || 0) / 1e6 * Number(d.precios[precio] || 0);
    s.costo += (Number(valores["recordatorio.enviado"] || 0) + Number(valores["respuesta.automatica"] || 0)) * Number(d.precios.plantillaWhatsapp || 0);
    semanas.set(lunes,s);
  }
  $("#metricasSemanas").innerHTML = [...semanas].sort(([a],[b]) => a.localeCompare(b)).map(([f,s]) => `<tr><th>${esc(f)}</th><td>${s.conv}</td><td>${s.citas}</td><td>${esc(monedaMetricas.format(s.costo))}</td></tr>`).join("") || '<tr><td colspan="4">No hay datos en este período.</td></tr>';
  $("#metricasCsv").disabled = false;
}
$("#metricasPeriodo").addEventListener("change", () => cargarMetricas());
$("#metricasCsv").addEventListener("click", () => {
  if (!metricasPanel) return;
  const d = metricasPanel, claves = [...new Set([...Object.keys(d.totales), ...d.porDia.flatMap(x => Object.keys(x.valores))])].sort();
  const celda = v => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = [["fecha", ...claves], ...d.porDia.map(x => [x.fecha,...claves.map(k => x.valores[k] || 0)])].map(f => f.map(celda).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
  a.href = url; a.download = `metricas-${d.desde}-${d.hasta}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function guardarMetricas(form, pedido) {
  const b = form.querySelector("button"); b.disabled = true;
  try { const d = await api("POST", pedido); metricasPanel = d; if (!d.pilotoInicio && $("#metricasPeriodo").value === "piloto") $("#metricasPeriodo").value = "30"; await cargarMetricas(); $("#metricasMensaje").textContent = "Guardado."; }
  catch (e) { $("#metricasMensaje").textContent = e.message; }
  finally { b.disabled = false; }
}
$("#inicioPilotoForm").addEventListener("submit", e => { e.preventDefault(); guardarMetricas(e.currentTarget, { accion: "guardarInicioPiloto", fecha: $("#inicioPiloto").value || null }); });
$("#metricasPrecios").addEventListener("submit", e => { e.preventDefault(); guardarMetricas(e.currentTarget, { accion: "guardarPreciosMetricas", ...Object.fromEntries([...new FormData(e.currentTarget)].map(([k,v]) => [k, Number(v)])) }); });

// Si la sesión guardada no responde (pasa en algunos Safari de iPhone), se sigue sin ella: aparece el inicio de sesión.
const sinRespuesta = (ms) => new Promise((ok) => setTimeout(() => ok({ data: { session: null }, tarde: true }), ms));
const lectura = await Promise.race([sb.auth.getSession().catch(() => ({ data: { session: null } })), sinRespuesta(8000)]);
const session = lectura.data?.session || null;
if (lectura.tarde) console.warn("La sesión guardada no respondió a tiempo; se pide iniciar sesión de nuevo.");
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

/* ---------- Equipo ---------- */
let equipoPanel = null;
function opcionesPerfil(rol) {
  return Object.entries(perfiles).map(([valor, texto]) => `<option value="${esc(valor)}"${valor === rol ? " selected" : ""}>${esc(texto)}</option>`).join("");
}
function pintarEquipo(d) {
  equipoPanel = d;
  $("#equipoRol").innerHTML = d.rol === "admin" ? opcionesPerfil("personal") : '<option value="personal">Personal</option>';
  const admins = d.miembros.filter(p => p.rol === "admin").length;
  $("#equipoLista").innerHTML = d.miembros.map(p => {
    const propio = p.email === d.yo, ultimo = p.rol === "admin" && admins === 1;
    const quitar = !propio && !ultimo && (d.rol === "admin" || p.rol === "personal");
    return `<article class="equipo-miembro"><div><h3>${esc(p.nombre)}</h3><p>${esc(p.email)}</p><p>${esc(perfiles[p.rol] || p.rol)} · ${p.dosPasos ? "Dos pasos activos" : "Pendiente de configurar"}</p></div><div class="equipo-acciones">${d.rol === "admin" ? `<label>Perfil de ${esc(p.nombre)}<select data-equipo-rol="${esc(p.email)}"${propio || ultimo ? " disabled" : ""}>${opcionesPerfil(p.rol)}</select></label>` : ""}${quitar ? `<button type="button" class="btn btn--warn" data-equipo-quitar="${esc(p.email)}">Dar de baja</button>` : ""}</div></article>`;
  }).join("");
}
async function cargarEquipo() {
  try { pintarEquipo(await api("GET", { accion: "equipo" })); }
  catch (e) { $("#equipoMensaje").textContent = e.message; }
}
$("#equipoInvitar").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, boton = form.querySelector("button"), b = Object.fromEntries(new FormData(form));
  boton.disabled = true;
  try {
    const d = await api("POST", { accion: "invitarMiembro", ...b });
    pintarEquipo(d); form.reset();
    $("#equipoMensaje").textContent = d.yaTeniaCuenta ? d.aviso : `Listo. Le llegó un correo a ${b.email.trim().toLowerCase()} para crear su contraseña; al entrar configurará su código de dos pasos.`;
  } catch (e) { $("#equipoMensaje").textContent = e.message; }
  finally { boton.disabled = false; }
});
$("#equipoLista").addEventListener("click", async e => {
  const b = e.target.closest("[data-equipo-quitar]");
  if (!b) return;
  const p = equipoPanel.miembros.find(p => p.email === b.dataset.equipoQuitar);
  if (!p || !confirm(`¿Quieres dar de baja a ${p.nombre}? Perderá el acceso al panel.`)) return;
  b.disabled = true;
  try { pintarEquipo(await api("POST", { accion: "quitarMiembro", email: p.email })); $("#equipoMensaje").textContent = "Listo. Esa persona ya no tiene acceso al panel."; }
  catch (e) { $("#equipoMensaje").textContent = e.message; b.disabled = false; }
});
$("#equipoLista").addEventListener("change", async e => {
  const s = e.target.closest("[data-equipo-rol]");
  if (!s) return;
  s.disabled = true;
  try { pintarEquipo(await api("POST", { accion: "cambiarRol", email: s.dataset.equipoRol, rol: s.value })); $("#equipoMensaje").textContent = "Perfil guardado."; }
  catch (e) { pintarEquipo(equipoPanel); $("#equipoMensaje").textContent = e.message; }
});
