// Recordatorio el día anterior a cada cita confirmada (mensaje de plantilla aprobada por Meta).
export async function enviarRecordatorios({ almacen, whatsapp, contenido, plantilla, ahora = () => new Date() }) {
  const manana = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date(ahora().getTime() + 864e5));
  const C = await contenido();
  let enviados = 0;
  for (const c of await almacen.citasDelDia(manana)) {
    const tramite = (C.data.tramites.find((t) => t.id === c.tramiteId) || {}).nombre || "tu trámite";
    try {
      await whatsapp.enviarPlantilla(c.telefono, plantilla, [c.nombre, tramite, c.hora]);
      await almacen.marcarRecordada(c.id);
      enviados++;
    } catch (e) {
      console.error("Recordatorio no enviado", c.id, e.message);
    }
  }
  return enviados;
}
