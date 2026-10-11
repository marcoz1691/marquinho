export const FUNCIONES = [
  { id: "sitio", nombre: "Página web pública", descripcion: "La página de la notaría que ve el público: portada, agenda en línea y asistente.", efectoAlApagar: "Quien entre a la página verá «Sitio en preparación». También se apagan el chat web, la agenda en línea y la recepción de documentos por la web. El panel sigue funcionando." },
  { id: "chatWeb", nombre: "Chat web con Sofía", descripcion: "La burbuja «¿Te ayudo?» de la página y el asistente a pantalla completa.", efectoAlApagar: "Desaparecen la burbuja y el asistente de la web; quien entre verá cómo contactar a la notaría." },
  { id: "whatsappBot", nombre: "Sofía en WhatsApp", descripcion: "Sofía responde sola los mensajes de WhatsApp.", efectoAlApagar: "Sofía deja de responder. Cada cliente recibe una vez al día un mensaje automático y sus mensajes quedan en Conversaciones para que el personal responda." },
  { id: "agenda", nombre: "Agendar citas", descripcion: "La página «Agenda tu cita» y las citas que agenda Sofía.", efectoAlApagar: "Se ocultan los botones de «Agenda tu cita», la página muestra cómo contactar y Sofía deja de ofrecer citas." },
  { id: "documentos", nombre: "Recepción de documentos", descripcion: "Enviar fotos o archivos para revisión previa, por la web o por WhatsApp.", efectoAlApagar: "No se reciben documentos: Sofía pedirá traerlos a la cita y la web no ofrece subirlos." },
  { id: "recordatorios", nombre: "Recordatorios de cita", descripcion: "El WhatsApp automático del día anterior a cada cita confirmada.", efectoAlApagar: "No se envían recordatorios hasta que la vuelvas a encender." }
];
export function leerFunciones(ajustes = {}) { return Object.fromEntries(FUNCIONES.map(({ id }) => [id, ajustes["funcion." + id] !== "0"])); }
export function funcionActiva(ajustes, id) { return leerFunciones(ajustes)[id] === true; }
export const funcionWebActiva = (f, id) => f.sitio && f[id];
export async function leerAjustes(almacen) {
  try { return await almacen.ajustes(); } catch (e) { console.error("No se pudieron leer las funciones:", e); return {}; }
}
export function errorWeb(ajustes, id) {
  const f = leerFunciones(ajustes);
  if (funcionWebActiva(f, id)) return null;
  const error = !f.sitio ? "El sitio de la notaría está en preparación. Escríbenos por WhatsApp o llámanos." : {
    chatWeb: "El asistente de la web no está disponible por ahora. Escríbenos por WhatsApp o llámanos.",
    agenda: "La agenda en línea no está disponible por ahora. Escríbenos por WhatsApp o llámanos para agendar.",
    documentos: "Por ahora no recibimos documentos por la web. Tráelos a tu cita."
  }[id];
  return { error, apagada: true };
}
