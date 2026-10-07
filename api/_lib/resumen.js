// Resumen compartido por la tarjeta web y el mensaje de WhatsApp.
import { calcularTarifa, money, AVISO_HABILITANTES } from "../../js/nucleo.js";

export function construirResumen(cita, C, { subirDocumentos = false } = {}) {
  const tramite = C.data.tramites.find((t) => t.id === cita.tramiteId);
  const tarifa = tramite ? calcularTarifa(tramite, C.tarifas) : null;
  const costo = tarifa?.total != null ? { total: money(tarifa.total), detalle: `Tarifa ${money(tarifa.base)} + IVA ${money(tarifa.iva)}` } : null;
  const fechaTexto = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(cita.fecha + "T12:00:00Z")).replace(",", "");
  return { tipo: "cita", codigo: cita.codigo ?? null, estado: cita.estado, fecha: cita.fecha, fechaTexto, hora: cita.hora, nombre: cita.nombre,
    tramite: tramite ? { id: tramite.id, nombre: tramite.nombre } : null, direccion: C.notaria.direccion, requisitos: [...(tramite?.req || [])],
    costo, aviso: costo ? AVISO_HABILITANTES : null, subirDocumentos };
}

export function textoResumen(r) {
  return [
    r.estado === "confirmada" ? `Tu cita quedó confirmada. Ticket ${r.codigo}` : `Recibimos tu solicitud. El personal la confirmará por WhatsApp. Ticket ${r.codigo}`,
    `${r.fechaTexto.charAt(0).toUpperCase() + r.fechaTexto.slice(1)}, ${r.hora}`,
    r.tramite ? `Trámite: ${r.tramite.nombre}` : "",
    `Lugar: ${r.direccion}`,
    r.requisitos.length ? "Lleva: • " + r.requisitos.join(" • ") : "",
    r.costo ? `Costo referencial: ${r.costo.total} con IVA.${r.aviso ? " " + r.aviso : ""}` : "",
    `Con tu ticket ${r.codigo} te atienden más rápido.`
  ].filter(Boolean).join("\n");
}
