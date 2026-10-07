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
  $("#app").hidden = true; $("#agendaV").hidden = true; $("#tabs").hidden = true; $("#salir").hidden = true; $("#acceso").hidden = false;
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
  if ($("#app").hidden && $("#agendaV").hidden) return;
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
  const refrescar = () => pestanaActual === "agendaV" ? cargarAgenda({ auto: true }) : Promise.all([cargarLista(), actual ? abrir(actual, true) : null]);
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
  $("#app").hidden = id !== "app"; $("#agendaV").hidden = id !== "agendaV";
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  if (id === "agendaV") { if (!$("#agFecha").value) $("#agFecha").value = hoyQuito(); cargarAgenda(); }
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) pestana(b.dataset.tab); });

async function cargarAgenda(opciones = {}) {
  // El refresco automático no repinta mientras eligen a alguien o tienen el puntero sobre la lista.
  if (opciones.auto && (document.activeElement?.tagName === "SELECT" || $("#agLista").matches(":hover"))) return;
  const a = await api("GET", { accion: "agenda", fecha: $("#agFecha").value });
  const titulo = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(a.fecha + "T12:00:00Z"));
  const activas = a.citas.filter((x) => x.estado !== "rechazada").length;
  const texto = (a.fecha === hoyQuito() ? "Hoy, " : "") + titulo + ` · ${activas} cita${activas === 1 ? "" : "s"}`;
  $("#agTitulo").textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  const personas = a.personal.map((p) => p.nombre || p.email);
  const opcionesDe = (actual) => ['<option value="">Sin asignar</option>', ...[...new Set([...personas, actual].filter(Boolean))]
    .map((n) => `<option${n === actual ? " selected" : ""}>${esc(n)}</option>`)].join("");
  const ESTADO = { pendiente: '<span class="tag tag--pend">Pendiente</span>', confirmada: '<span class="tag">Confirmada</span>', atendida: '<span class="tag">Atendida</span>', rechazada: '<span class="tag">Cancelada</span>' };
  $("#agLista").innerHTML = a.citas.map((x) => `<div class="ag-cita ag-cita--${esc(x.estado)}">
      <span class="ag-hora">${esc(x.hora)}${x.codigo ? `<small>Ticket ${esc(x.codigo)}</small>` : ""}</span>
      <div><b>${esc(x.nombre)} ${ESTADO[x.estado] || ""}</b><small>${esc(x.tramite)}${x.telefono && !String(x.telefono).startsWith("web:") ? ` · <a href="https://wa.me/${esc(x.telefono)}" target="_blank" rel="noopener">+${esc(x.telefono)}</a>` : ""}${x.nota ? " · " + esc(x.nota) : ""}</small></div>
      ${x.estado === "rechazada" ? "<span></span>" : `<select data-asignar="${esc(x.id)}" aria-label="Asignar a">${opcionesDe(x.asignadaA)}</select>`}
      <div class="acc">${x.estado === "pendiente" ? `<button class="btn" data-cita="${esc(x.id)}" data-estado="confirmada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Confirmar</button><button class="btn btn--warn" data-cita="${esc(x.id)}" data-estado="rechazada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Rechazar</button>` : ""}
        ${x.estado === "confirmada" ? `<button class="btn btn--line" data-cita="${esc(x.id)}" data-estado="atendida">Atendida</button><button class="btn btn--warn" data-cita="${esc(x.id)}" data-estado="rechazada"${x.contacto ? ` data-contacto="${esc(x.contacto)}"` : ""}>Cancelar</button>` : ""}
        <button class="btn btn--line" data-chat="${esc(x.conversacionId)}">Ver chat</button></div>
    </div>`).join("") || '<p class="vacio">No hay citas para este día.</p>';
}
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
    $("#agResultados").innerHTML = citas.map((x) => `<div class="ficha"><b>${esc(x.fecha)} · ${esc(x.hora)} · Ticket ${esc(x.codigo)}</b><span>${esc(x.nombre)} · ${esc(x.tramite)} · ${esc(x.estado)}</span><small>${esc(x.telefono)}</small><div class="acc"><button type="button" class="btn btn--line" data-chat="${esc(x.conversacionId)}">Ver chat</button></div></div>`).join("");
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
