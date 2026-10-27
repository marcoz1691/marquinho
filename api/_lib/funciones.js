export const FUNCIONES = [
  { id: "sitio", nombre: "Página web pública", descripcion: "La página de la notaría que ve el público: portada, agenda en línea y asistente.", efectoAlApagar: "Quien entre a la página verá «Sitio en preparación». También se apagan el chat web, la agenda en línea y la recepción de documentos por la web. El panel sigue funcionando." },
  { id: "chatWeb", nombre: "Chat web con Sofía", descripcion: "La burbuja «¿Te ayudo?» de la página y el asistente a pantalla completa.", efectoAlApagar: "Desaparecen la burbuja y el asistente de la web; quien entre verá cómo contactar a la notaría." },
  { id: "whatsappBot", nombre: "Sofía en WhatsApp", descripcion: "Sofía responde sola los mensajes de WhatsApp.", efectoAlApagar: "Sofía deja de responder. Cada cliente recibe una vez al día un mensaje automático y sus mensajes quedan en Conversaciones para que el personal responda." },
  { id: "agenda", nombre: "Agendar citas", descripcion: "La página «Agenda tu cita» y las citas que agenda Sofía.", efectoAlApagar: "Se ocultan los botones de «Agenda tu cita», la página muestra cómo contactar y Sofía deja de ofrecer citas." },
  { id: "documentos", nombre: "Recepción de documentos", descripcion: "Enviar fotos o archivos para revisión previa, por la web o por WhatsApp.", efectoAlApagar: "No se reciben documentos: Sofía pedirá traerlos a la cita y la web no ofrece subirlos." },
  { id: "recordatorios", nombre: "Recordatorios de cita", descripcion: "El WhatsApp automático del día anterior a cada cita confirmada.", efectoAlApagar: "No se envían recordatorios hasta que la vuelvas a encender." },
  // Funciones nuevas que deben estar apagadas hasta que alguien las encienda a propósito (porDefecto: false).
  { id: "portal", porDefecto: false, nombre: "Mis trámites (cuenta del cliente)", descripcion: "Cuenta opcional para que el cliente guarde sus trámites y vea sus citas, documentos y pendientes. Necesita el envío de correos configurado.", efectoAlApagar: "Desaparece «Guardar este trámite en mi cuenta» y las páginas de la cuenta muestran que no están disponibles. Los trámites siguen funcionando sin cuenta." },
  { id: "pagosEnLinea", porDefecto: false, nombre: "Pagos en línea", descripcion: "Pago de trámites con tarjeta desde la cuenta del cliente. Solo funciona con una pasarela de pagos contratada y configurada.", efectoAlApagar: "No se muestra la opción de pagar en línea: el pago se hace en la notaría." }
];
// Funciones que necesitan configuración del servidor para funcionar. En un despliegue (VERCEL_ENV) no pueden quedar
// encendidas sin ella: la web no ofrece una cuenta cuyo código nunca llegaría ni un pago sin pasarela.
const REQUISITOS = {
  portal: { variables: ["CUENTA_SECRETO", "RESEND_API_KEY", "CORREO_REMITENTE"], falta: "Falta configurar el envío de correos y la clave de las cuentas en el servidor." },
  pagosEnLinea: { variables: ["PAGOS_PROVEEDOR"], falta: "Falta contratar y configurar la pasarela de pagos." }
};
export function faltaConfiguracion(id, env = process.env) {
  const r = REQUISITOS[id];
  if (!r || !env.VERCEL_ENV) return null;
  return r.variables.every((k) => env[k]) ? null : r.falta;
}
// Las funciones de siempre están encendidas salvo que se apaguen ("0"); las de porDefecto:false, solo si se encienden ("1").
export function leerFunciones(ajustes = {}, env = process.env) {
  return Object.fromEntries(FUNCIONES.map(({ id, porDefecto = true }) => [id, (porDefecto ? ajustes["funcion." + id] !== "0" : ajustes["funcion." + id] === "1") && !faltaConfiguracion(id, env)]));
}
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
    documentos: "Por ahora no recibimos documentos por la web. Tráelos a tu cita.",
    portal: "Las cuentas de cliente no están disponibles por ahora. Puedes seguir tu trámite con tu ticket por WhatsApp o en la notaría.",
    pagosEnLinea: "El pago en línea no está disponible: paga en la notaría el día de tu trámite."
  }[id];
  return { error, apagada: true };
}
