// Una tarjeta compartida por la burbuja y la página, ligada a su sesión original.
import { esc } from "./chat-nucleo.js";
import { crearIcs } from "./calendario.js";
import { reducirImagen } from "./imagenes.js";
export function htmlCita(r) {
  return '<h3>Tu cita</h3><strong class="cita-ticket">Ticket ' + esc(r.codigo) + '</strong><p>' +
    (r.estado === "pendiente" ? "Recibimos tu solicitud. El personal la confirmará por WhatsApp." : "Tu cita quedó confirmada.") +
    '</p><p>' + esc(r.fechaTexto || r.fecha) + ' · ' + esc(r.hora) + '</p>' +
    (r.tramite ? '<p>Trámite: ' + esc(r.tramite.nombre) + '</p>' : '') + '<p>Lugar: ' + esc(r.direccion) + '</p>' +
    (r.requisitos?.length ? '<p>Lleva:</p><ul>' + r.requisitos.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    (r.costo ? '<p>Costo referencial: <b>' + esc(r.costo.total) + '</b> con IVA.</p><p>' + esc(r.costo.detalle) + '</p>' : '') +
    (r.aviso ? '<p class="cita-aviso">' + esc(r.aviso) + '</p>' : '') +
    '<div class="cita-botones"><button type="button" data-calendario>Agregar a mi calendario</button>' +
    (r.subirDocumentos ? '<button type="button" data-subir aria-expanded="false">Subir documentos</button>' : '') + '</div>' +
    (r.subirDocumentos ? '<form class="cita-subida" hidden novalidate><label>Archivo<input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"></label><label>Descripción<input name="descripcion" minlength="2" maxlength="120" required></label><label class="cita-consentimiento"><input type="checkbox" name="acepta"> <span>Acepto el <a href="privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a></span></label><button type="submit">Enviar</button><progress hidden aria-label="Progreso del envío"></progress><p class="cita-estado" aria-live="polite"></p><ul class="cita-documentos" aria-label="Documentos enviados"></ul></form>' : '');
}
const base64Archivo = (file) => new Promise((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(lector.result.split(",")[1]);
  lector.onerror = () => rechazar(new Error("No pude leer el archivo. Inténtalo de nuevo."));
  lector.readAsDataURL(file);
});
export function tarjetaCita(resumen, sesion) {
  const tarjeta = document.createElement("section");
  tarjeta.className = "cita-tarjeta";
  tarjeta.setAttribute("aria-label", "Tu cita, ticket " + resumen.codigo);
  tarjeta.innerHTML = htmlCita(resumen);
  tarjeta.querySelector("[data-calendario]").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([crearIcs(resumen)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "cita-" + String(resumen.codigo).replace(/\D/g, "") + ".ics";
    tarjeta.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const form = tarjeta.querySelector("form");
  if (!form) return tarjeta;
  const estado = form.querySelector(".cita-estado"), progreso = form.querySelector("progress"), enviar = form.querySelector("button");
  const pintarDocumentos = (documentos) => {
    form.querySelector(".cita-documentos").innerHTML = (documentos || []).map((d) => '<li>' + esc(d.descripcion) + ' · ' + esc(d.nombre) + ' · ' + esc(d.estado) + '</li>').join("");
  };
  async function pedir(url, opciones) {
    const respuesta = await fetch(url, opciones);
    const data = await respuesta.json();
    if (!respuesta.ok) throw new Error(data.error || "No pude enviar el documento. Inténtalo de nuevo.");
    return data;
  }
  let cargando = false, enviando = false;
  tarjeta.querySelector("[data-subir]").addEventListener("click", async (e) => {
    form.hidden = !form.hidden; e.currentTarget.setAttribute("aria-expanded", String(!form.hidden));
    // El formulario se abre debajo de los botones: se baja hasta verlo completo para que no quede tapado por la caja de escritura.
    if (!form.hidden) form.scrollIntoView({ block: "end", inline: "nearest" });
    if (form.hidden || cargando || enviando) return;
    cargando = true; estado.textContent = "Buscando tus documentos…";
    try {
      const data = await pedir("/api/documentos?" + new URLSearchParams({ sesion, ticket: resumen.codigo }));
      pintarDocumentos(data.documentos); estado.textContent = "";
    } catch (err) { estado.textContent = err.message; }
    finally { cargando = false; }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando || cargando) return;
    if (!form.elements.acepta.checked) { estado.textContent = "Acepta el aviso de privacidad para enviar documentos."; return; }
    const archivo = form.elements.archivo.files[0], descripcion = form.elements.descripcion.value.trim();
    if (!archivo) { estado.textContent = "Elige un archivo para enviar."; return; }
    if (descripcion.length < 2 || descripcion.length > 120) { estado.textContent = "Escribe una descripción de 2 a 120 caracteres."; return; }
    enviando = true; enviar.disabled = true; progreso.hidden = false; estado.textContent = "Preparando tu archivo…";
    try {
      const file = await reducirImagen(archivo);
      if (file.size > 3 * 1024 * 1024) throw new Error("El archivo pesa más de 3 MB. Elige uno más pequeño o una foto.");
      const base64 = await base64Archivo(file);
      estado.textContent = "Enviando tu documento…";
      const data = await pedir("/api/documentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesion, ticket: resumen.codigo, descripcion, nombre: file.name, base64, aceptaAviso: true }) });
      pintarDocumentos(data.documentos); estado.textContent = "Documento enviado.";
    } catch (err) { estado.textContent = err.message; }
    finally { enviando = false; enviar.disabled = false; progreso.hidden = true; }
  });
  return tarjeta;
}
