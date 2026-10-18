const $ = (id) => document.getElementById(id);
// El vínculo viaja en el fragmento (#): el navegador nunca lo envía al servidor ni lo copia al encabezado Referer.
const parametros = new URLSearchParams(location.hash.replace(/^#/, ""));
const tokenVinculo = parametros.get("vincular") || "";
if (location.hash) history.replaceState(null, "", "/cuenta.html");
let correo = "";

async function pedir(accion, datos = {}) {
  let respuesta;
  try {
    respuesta = await fetch("/api/cuenta", { method: "POST", headers: { "Content-Type": "application/json", "X-Sofia": "1" },
      body: JSON.stringify({ accion, ...datos }) });
  } catch { throw new Error("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo."); }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error || "No pudimos completar la solicitud.");
  return cuerpo;
}

async function guardarVinculo() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(tokenVinculo)) return null;
  return (await pedir("vincular", { token: tokenVinculo })).id;
}

async function continuar() {
  try {
    const id = await guardarVinculo();
    location.replace("/mis-tramites.html" + (id ? "?id=" + encodeURIComponent(id) : ""));
  } catch (e) {
    // Ya inició sesión, así que el enlace puede explicarse sin revelar datos de otro trámite.
    $("estado").textContent = e.message;
    history.replaceState(null, "", "/cuenta.html");
  }
}

$("form-correo").addEventListener("submit", async (e) => {
  e.preventDefault();
  correo = $("correo").value.trim().toLowerCase();
  if (!correo || !$("correo").validity.valid) { $("estado").textContent = "Escribe un correo válido."; $("correo").focus(); return; }
  const boton = e.submitter; boton.disabled = true; $("estado").textContent = "Enviando tu código…";
  try {
    const r = await pedir("pedirCodigo", { email: correo });
    $("correo-elegido").textContent = correo;
    $("paso-correo").hidden = true; $("paso-codigo").hidden = false;
    $("estado").textContent = r.mensaje; $("estado").classList.add("estado--bien"); $("codigo").focus();
  } catch (err) { $("estado").textContent = err.message; }
  finally { boton.disabled = false; }
});

$("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codigo = $("codigo").value.replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigo)) { $("estado").textContent = "Escribe los seis dígitos del código."; $("codigo").focus(); return; }
  const boton = e.submitter; boton.disabled = true; $("estado").classList.remove("estado--bien"); $("estado").textContent = "Verificando…";
  try { await pedir("verificar", { email: correo, codigo }); await continuar(); }
  catch (err) { $("estado").textContent = err.message; boton.disabled = false; }
});

$("cambiar-correo").addEventListener("click", () => {
  $("paso-codigo").hidden = true; $("paso-correo").hidden = false; $("codigo").value = ""; $("estado").textContent = ""; $("correo").focus();
});

// Si ya hay una sesión, no vuelve a pedir código; consume el vínculo pendiente y entra al portal.
fetch("/api/cuenta?accion=yo", { headers: { Accept: "application/json" } }).then(async (r) => {
  if (r.ok) await continuar();
  else if (r.status !== 401) { const b = await r.json().catch(() => ({})); if (b.error) $("estado").textContent = b.error; }
}).catch(() => {});
