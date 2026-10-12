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
    duracionMin: duracionValida(Number(ajustes["citas.duracionMin"])) ? Number(ajustes["citas.duracionMin"]) : 90,
    bloqueos: [...(C.notaria.citas?.feriados || []).map((fecha) => ({ fecha, hora: null, motivo: "Feriado", fijo: true })), ...extras],
    horario: C.notaria.horario
  };
}
export const duracionValida = n => Number.isInteger(n) && n >= 30 && n <= 240 && n % 30 === 0;
export const seCruzan = (a, b, duracion) => minutos(a) < minutos(b) + duracion && minutos(b) < minutos(a) + duracion;
function candidatos(personas, citas, fecha, hora, duracion) {
  const inicio = minutos(hora), dia = new Date(fecha + "T12:00:00Z").getUTCDay();
  const libres = personas.filter(p => p.atiendeCitas && p.horario?.[dia]?.some(([a,b]) => minutos(a) <= inicio && minutos(b) >= inicio + duracion) &&
    !p.ausencias.some(a => a.desde <= fecha && a.hasta >= fecha) &&
    !citas.some(c => c.asignadaA === p.email && seCruzan(c.hora, hora, duracion)));
  return libres.length > citas.filter(c => !c.asignadaA && seCruzan(c.hora, hora, duracion)).length ? libres : [];
}
function disponibles({ C, ajustes, fecha, ahora = new Date(), excluirIds = [] }, citas, personas) {
  if (!fechaValida(fecha)) return [];
  const { porHora, duracionMin, bloqueos, horario: H } = reglasCitas(C, ajustes);
  const hoy = fechaQuito(ahora);
  if (fecha < hoy || !H.dias.includes(new Date(fecha + "T12:00:00Z").getUTCDay()) || bloqueos.some((b) => b.fecha === fecha && b.hora === null)) return [];
  const ocupadas = citas.filter((c) => ["pendiente", "confirmada"].includes(c.estado) && !excluirIds.includes(c.id));
  const modoHorarios = personas.some(p => p.atiendeCitas && p.horario !== null);
  const libres = [];
  for (let m = minutos(H.abre); m < minutos(H.cierra); m += 30) {
    const hora = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    if (new Date(fecha + "T" + hora + ":00-05:00") <= ahora) continue;
    if (bloqueos.some((b) => b.fecha === fecha && b.hora?.slice(0, 2) === hora.slice(0, 2))) continue;
    if (modoHorarios ? m + duracionMin <= minutos(H.cierra) && candidatos(personas, ocupadas, fecha, hora, duracionMin).length > 0 : ocupadas.filter((c) => c.hora.slice(0, 2) === hora.slice(0, 2)).length < porHora) libres.push(hora);
  }
  return libres;
}
export async function horasLibres(opciones) {
  const [ajustes, personas, citas] = await Promise.all([opciones.ajustes ?? opciones.almacen.ajustes(), opciones.almacen.matriceros(), opciones.almacen.agenda(opciones.fecha)]);
  return disponibles({ ...opciones, ajustes }, citas, personas);
}
export async function diasDisponibles({ almacen, C, ajustes, desde, dias = 30, ahora = new Date() }) {
  const [config, personas, citas] = await Promise.all([ajustes ?? almacen.ajustes(), almacen.matriceros(), almacen.citasEntre(desde, sumarDias(desde, dias - 1))]);
  const salida = [];
  for (let n = 0; n < dias; n++) {
    const fecha = sumarDias(desde, n),
      horas = disponibles(
        { C, ajustes: config, fecha, ahora },
        citas.filter((c) => c.fecha === fecha), personas
      );
    if (horas.length) salida.push({ fecha, horas });
  }
  return salida;
}

export async function elegirMatricero(opciones) {
  const { almacen, fecha, hora, excluirIds = [] } = opciones;
  const [ajustes, personas, todas] = await Promise.all([opciones.ajustes ?? almacen.ajustes(), almacen.matriceros(), almacen.agenda(fecha)]);
  if (!personas.some(p => p.atiendeCitas && p.horario !== null)) return null;
  if (!disponibles({ ...opciones, ajustes }, todas, personas).includes(hora)) return null;
  const citas = todas.filter(c => ["pendiente", "confirmada"].includes(c.estado) && !excluirIds.includes(c.id));
  const carga = p => citas.filter(c => c.asignadaA === p.email);
  const primera = p => Math.min(...carga(p).map(c => minutos(c.hora)), 1440);
  return candidatos(personas, citas, fecha, hora, reglasCitas(opciones.C, ajustes).duracionMin)
    .sort((a,b) => carga(a).length - carga(b).length || primera(b) - primera(a) || a.email.localeCompare(b.email))[0]?.email || null;
}
