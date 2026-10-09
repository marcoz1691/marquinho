import { minutos } from "../../js/nucleo.js";
export const fechaQuito = (t) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
export const sumarDias = (fecha, n) => new Date(new Date(fecha + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
export const fechaValida = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + "T12:00:00Z")) && sumarDias(f, 0) === f;
export function celular(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) d = "593" + d.slice(1);
  return /^\d{11,13}$/.test(d) ? d : null;
}
export function reglasCitas(C, ajustes = {}) {
  const oficial = C.notaria.citas?.porHora ?? 2,
    valor = Number(ajustes["citas.porHora"] ?? oficial);
  let extras = [];
  try {
    const b = JSON.parse(ajustes["citas.bloqueos"] || "[]");
    if (Array.isArray(b)) extras = b;
  } catch {}
  return {
    porHora: Number.isInteger(valor) && valor >= 1 && valor <= 20 ? valor : oficial,
    porHoraOficial: oficial,
    bloqueos: [...(C.notaria.citas?.feriados || []).map((fecha) => ({ fecha, hora: null, motivo: "Feriado", fijo: true })), ...extras],
    horario: C.notaria.horario
  };
}
function disponibles({ C, ajustes, fecha, ahora = new Date(), excluirIds = [] }, citas) {
  if (!fechaValida(fecha)) return [];
  const { porHora, bloqueos, horario: H } = reglasCitas(C, ajustes);
  const hoy = fechaQuito(ahora);
  if (fecha < hoy || !H.dias.includes(new Date(fecha + "T12:00:00Z").getUTCDay()) || bloqueos.some((b) => b.fecha === fecha && b.hora === null)) return [];
  const ocupadas = citas.filter((c) => ["pendiente", "confirmada"].includes(c.estado) && !excluirIds.includes(c.id));
  const libres = [];
  for (let m = minutos(H.abre); m < minutos(H.cierra); m += 30) {
    const hora = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    if (new Date(fecha + "T" + hora + ":00-05:00") <= ahora) continue;
    if (bloqueos.some((b) => b.fecha === fecha && b.hora?.slice(0, 2) === hora.slice(0, 2))) continue;
    if (ocupadas.filter((c) => c.hora.slice(0, 2) === hora.slice(0, 2)).length < porHora) libres.push(hora);
  }
  return libres;
}
export async function horasLibres(opciones) {
  return disponibles(opciones, await opciones.almacen.agenda(opciones.fecha));
}
export async function diasDisponibles({ almacen, C, ajustes, desde, dias = 30, ahora = new Date() }) {
  const citas = await almacen.citasEntre(desde, sumarDias(desde, dias - 1)),
    salida = [];
  for (let n = 0; n < dias; n++) {
    const fecha = sumarDias(desde, n),
      horas = disponibles(
        { C, ajustes, fecha, ahora },
        citas.filter((c) => c.fecha === fecha)
      );
    if (horas.length) salida.push({ fecha, horas });
  }
  return salida;
}
