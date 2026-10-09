// Retención de datos (LOPDP): borra las conversaciones de clientes sin actividad y los documentos borrados desde el panel.
// Las conversaciones del asistente solo sirven para preparar trámites; no son parte del protocolo notarial.
const DIA = 864e5;
const RETENCION_POR_DEFECTO = 90, RETENCION_MINIMA = 30, BORRADOS_DIAS = 7;

export async function purgarDatos({ almacen, ahora = () => new Date(), retencionDias = RETENCION_POR_DEFECTO }) {
  const crudo = String(retencionDias ?? "").trim();
  const dias = crudo !== "" && Number.isFinite(Number(crudo)) ? Math.max(RETENCION_MINIMA, Number(crudo)) : RETENCION_POR_DEFECTO;
  const t = ahora().getTime();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora());
  return almacen.purgar({ inactivasAntesDe: t - dias * DIA, borradosAntesDe: t - BORRADOS_DIAS * DIA, hoy });
}
