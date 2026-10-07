// Calendario local de Quito: no cambia según la zona del navegador.
const texto = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const fecha = (d) => d.toISOString().slice(0, 19).replace(/[-:]/g, "");
function plegar(linea) {
  let salida = "", bytes = 0;
  for (const c of linea) {
    const n = new TextEncoder().encode(c).length;
    if (bytes + n > 75) { salida += "\r\n "; bytes = 1; }
    salida += c; bytes += n;
  }
  return salida;
}
export function crearIcs(r) {
  const inicio = new Date(r.fecha + "T" + r.hora + ":00Z");
  const fin = new Date(inicio.getTime() + 3600000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Notaría 41//Citas//ES", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:America/Guayaquil", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0500", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", "UID:" + texto(r.codigo) + "-" + r.fecha.replace(/-/g, "") + "@notaria41",
    // Marca determinista de la cita para mantener la función pura.
    "DTSTAMP:" + fecha(new Date(inicio.getTime() + 5 * 3600000)) + "Z",
    "DTSTART;TZID=America/Guayaquil:" + fecha(inicio), "DTEND;TZID=America/Guayaquil:" + fecha(fin),
    "SUMMARY:" + texto("Notaría 41 · " + (r.tramite?.nombre || "Cita") + " · Ticket " + r.codigo),
    "LOCATION:" + texto(r.direccion), "DESCRIPTION:" + texto([r.nombre, ...(r.requisitos || [])].join("\n")),
    "STATUS:" + (r.estado === "pendiente" ? "TENTATIVE" : "CONFIRMED"), "END:VEVENT", "END:VCALENDAR"].map(plegar).join("\r\n") + "\r\n";
}
