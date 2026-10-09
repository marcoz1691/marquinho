import { esc } from "./chat-nucleo.js";
import { tarjetaCita } from "./cita-tarjeta.js";
const $ = (id) => document.getElementById(id);
let disponibilidad = { dias: [], tramites: [] },
  tramite = new URLSearchParams(location.search).get("tramite") || "",
  dia = "",
  hora = "",
  paso = 1,
  mes = "",
  enviando = false;
const fechaTexto = (f) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(f + "T12:00:00Z")).replace(",", "");
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hasta = new Date(new Date(hoy + "T12:00:00Z").getTime() + 29 * 864e5).toISOString().slice(0, 10);
// Los errores del navegador varían de idioma: muestra siempre una alternativa en español.
async function consultar(opciones) {
  try {
    const r = await fetch("/api/cita", opciones);
    return { r, b: await r.json() };
  } catch {
    throw new Error("No pudimos conectar. Inténtalo de nuevo o escríbenos por WhatsApp o teléfono.");
  }
}
function contacto(N) {
  return (
    `<a class="contacto-cita" href="https://wa.me/${esc(String(N.whatsapp).replace(/\D/g, ""))}">Escríbenos por WhatsApp</a>` +
    (N.telefonos || []).map((t) => `<a class="contacto-cita" href="tel:${esc(t.replace(/[^\d+]/g, ""))}">${esc(t)}</a>`).join("")
  );
}
fetch("data/notaria.json")
  .then((r) => {
    if (!r.ok) throw new Error();
    return r.json();
  })
  .then((N) => {
    $("alternativas").innerHTML = contacto(N);
    $("contacto-confirmacion").innerHTML = contacto(N);
  })
  .catch(() => {
    $("alternativas").textContent = "Puedes contactar a la notaría desde el inicio.";
  });
function actualizarResumen() {
  $("resumen-tramite").textContent = disponibilidad.tramites.find((t) => t.id === tramite)?.nombre || "Aún no sé / otro";
  $("resumen-dia").textContent = dia ? fechaTexto(dia) : "Por elegir";
  $("resumen-hora").textContent = hora || "Por elegir";
}
function ir(n, foco = true) {
  paso = n;
  for (let i = 1; i <= 4; i++) $("paso-" + i).hidden = i !== n;
  document.querySelectorAll(".progreso li").forEach((li, i) => {
    if (i === n - 1) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
  $("resumen").hidden = n === 4;
  if (foco) $("titulo-" + n).focus();
  actualizarResumen();
}
function pintarTramites() {
  const q = $("buscar").value.toLocaleLowerCase("es");
  $("tramite").innerHTML =
    '<option value="">Aún no sé / otro</option>' +
    disponibilidad.tramites
      .filter((t) => t.id === tramite || t.nombre.toLocaleLowerCase("es").includes(q))
      .map((t) => `<option value="${esc(t.id)}">${esc(t.nombre)}</option>`)
      .join("");
  $("tramite").value = tramite;
}
function pintarHoras() {
  const horas = disponibilidad.dias.find((d) => d.fecha === dia)?.horas || [];
  $("lista-horas").innerHTML = horas
    .map((h) => `<label><input type="radio" name="hora" value="${esc(h)}" ${hora === h ? "checked" : ""}>${esc(h)}</label>`)
    .join("");
  $("a-datos").disabled = !hora;
  actualizarResumen();
}
function pintarCalendario() {
  const [y, m] = mes.split("-").map(Number),
    primero = new Date(Date.UTC(y, m - 1, 1)),
    cantidad = new Date(Date.UTC(y, m, 0)).getUTCDate();
  $("mes").textContent = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", month: "long", year: "numeric" }).format(primero);
  $("anterior").disabled = mes <= hoy.slice(0, 7);
  $("siguiente").disabled = mes >= hasta.slice(0, 7);
  let html = '<span aria-hidden="true"></span>'.repeat((primero.getUTCDay() + 6) % 7);
  for (let n = 1; n <= cantidad; n++) {
    const f = mes + "-" + String(n).padStart(2, "0"),
      horas = disponibilidad.dias.find((d) => d.fecha === f)?.horas || [];
    html += `<button type="button" data-fecha="${f}" aria-label="${esc(fechaTexto(f))}, ${horas.length} horas libres" aria-pressed="${dia === f}" ${!horas.length ? "disabled" : ""}>${n}</button>`;
  }
  $("calendario").innerHTML = html;
}
function aviso(texto, alternativa = false) {
  $("estado").textContent = texto;
  $("alternativas").hidden = !alternativa;
}
async function cargar() {
  try {
    const { r, b } = await consultar();
    if (!r.ok) throw new Error(b.error);
    disponibilidad = b;
    if (!b.tramites.some((t) => t.id === tramite)) tramite = "";
    mes = hoy.slice(0, 7);
    $("horario").textContent = b.horario;
    pintarTramites();
    pintarCalendario();
    ir(1, false);
    if (!b.dias.length) {
      $("a-fecha").disabled = true;
      aviso("No quedan horas libres por ahora. Escríbenos o llámanos para ayudarte.", true);
    } else aviso("");
  } catch (e) {
    aviso(e.message || "No pudimos cargar las horas libres. Escríbenos o llámanos para agendar.", true);
  }
}
$("buscar").addEventListener("input", pintarTramites);
$("tramite").addEventListener("change", () => {
  tramite = $("tramite").value;
  actualizarResumen();
});
$("a-fecha").addEventListener("click", () => ir(2));
$("a-datos").addEventListener("click", () => ir(3));
document.querySelectorAll("[data-cambiar]").forEach((b) => b.addEventListener("click", () => ir(Number(b.dataset.cambiar))));
for (const [id, delta] of [
  ["anterior", -1],
  ["siguiente", 1]
])
  $(id).addEventListener("click", () => {
    const [y, m] = mes.split("-").map(Number);
    mes = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
    pintarCalendario();
  });
$("calendario").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fecha]");
  if (!b || b.disabled) return;
  dia = b.dataset.fecha;
  hora = "";
  pintarCalendario();
  pintarHoras();
  $("calendario").querySelector(`[data-fecha="${dia}"]`).focus();
});
$("calendario").addEventListener("keydown", (e) => {
  const saltos = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
  if (!(e.key in saltos)) return;
  const botones = [...$("calendario").querySelectorAll("button")];
  let i = botones.indexOf(e.target);
  if (i < 0) return;
  e.preventDefault();
  const salto = saltos[e.key];
  for (i += salto; i >= 0 && i < botones.length; i += salto)
    if (!botones[i].disabled) {
      botones[i].focus();
      break;
    }
});
$("lista-horas").addEventListener("change", (e) => {
  hora = e.target.value;
  $("a-datos").disabled = false;
  actualizarResumen();
});
function validar() {
  let primero = null;
  const nombre = $("nombre").value.trim(),
    cel = $("celular").value.replace(/\D/g, "");
  const errores = {
    nombre: nombre.length < 2 || nombre.length > 80 ? "Escribe tu nombre de 2 a 80 caracteres." : "",
    celular: !/^(09\d{8}|5939\d{8})$/.test(cel) ? "Escribe tu celular de Ecuador, por ejemplo 0991234567." : "",
    nota: $("nota").value.length > 200 ? "Escribe una nota de hasta 200 caracteres." : "",
    aceptaAviso: !$("aceptaAviso").checked ? "Acepta el aviso de privacidad para agendar tu cita." : ""
  };
  for (const [id, error] of Object.entries(errores)) {
    $("error-" + id).textContent = error;
    $(id).setAttribute("aria-invalid", String(!!error));
    if (error && !primero) primero = $(id);
  }
  if (primero) primero.focus();
  return !primero;
}
$("datos").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (enviando || !validar()) return;
  enviando = true;
  $("confirmar").disabled = true;
  aviso("Guardando tu cita…");
  try {
    const { r, b } = await consultar({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: $("nombre").value.trim(),
        celular: $("celular").value,
        tramiteId: tramite || null,
        fecha: dia,
        hora,
        nota: $("nota").value,
        aceptaAviso: $("aceptaAviso").checked,
        sitio: $("sitio").value
      })
    });
    if (r.status === 409 && b.dias) {
      disponibilidad.dias = b.dias;
      hora = "";
      if (!b.dias.some((d) => d.fecha === dia)) dia = "";
      pintarCalendario();
      pintarHoras();
      ir(2);
      aviso(b.error, !b.dias.length);
      return;
    }
    if (!r.ok) throw new Error(b.error || "No pudimos guardar tu cita. Inténtalo de nuevo.");
    $("tarjeta").replaceChildren(tarjetaCita(b.resumen));
    $("titulo-4").textContent = b.resumen.estado === "pendiente" ? "Recibimos tu solicitud" : "Tu visita está agendada";
    ir(4);
    aviso("");
  } catch (e) {
    aviso(e.message || "No pudimos conectar. Inténtalo de nuevo o contáctanos.", true);
  } finally {
    enviando = false;
    $("confirmar").disabled = false;
  }
});
cargar();
