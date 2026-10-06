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

// Resumen de la mañana al personal: las citas de hoy, para repartirlas en el panel.
export async function resumenDelDia({ almacen, whatsapp, contenido, plantilla, destino, ahora = () => new Date() }) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora());
  const citas = (await almacen.agenda(hoy)).filter((c) => c.estado === "confirmada" || c.estado === "pendiente");
  if (!citas.length || !destino) return 0;
  const C = await contenido();
  const nombreDe = (id) => (C.data.tramites.find((t) => t.id === id) || {}).nombre || "trámite por definir";
  const lista = citas.map((c) => `${c.hora} ${c.nombre} (${nombreDe(c.tramiteId)}${c.estado === "pendiente" ? ", pendiente" : ""})`).join("; ");
  // Los parámetros de una plantilla no admiten saltos de línea.
  await whatsapp.enviarPlantilla(destino, plantilla, [`Citas de hoy (${citas.length}): ${lista}. Repártelas en el panel.`.slice(0, 1000)]);
  return citas.length;
}
