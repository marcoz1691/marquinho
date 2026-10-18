// Línea de tiempo del trámite que ve el cliente en «Mis trámites» (Sofía PreFirma).
// Registrar un evento nunca debe romper la acción que lo origina (crear o decidir una cita, revisar un documento):
// si el almacén falla, se avisa en el registro sin datos personales y se sigue.
import { NOTARIA_POR_DEFECTO } from "./notaria.js";

// Textos por defecto para el cliente. Informan el estado sin prometer resultados: el acto se celebra ante el notario.
export const TEXTOS = {
  creada: "Recibimos tu solicitud de cita.",
  confirmada: "Tu cita quedó confirmada.",
  rechazada: "No pudimos confirmar tu cita. Escríbenos para elegir otra fecha.",
  atendida: "Tu cita fue atendida en la notaría.",
  documento_aprobado: "El personal revisó tu documento y está en orden.",
  documento_observado: "Hay un documento por corregir."
};

export async function registrarEvento(almacen, { notariaId = NOTARIA_POR_DEFECTO, solicitudId, tipo, textoCliente, visibleCliente = true, actor = "sistema" } = {}) {
  if (!solicitudId || !tipo) return false;
  try {
    await almacen.registrarEventoTramite({ notariaId, solicitudId, tipo, visibleCliente, textoCliente: textoCliente || TEXTOS[tipo] || "", actor });
    return true;
  } catch (e) {
    // Solo el tipo y el código del error: el mensaje del almacén podría traer datos de la fila.
    console.warn("No se registró el evento del trámite:", tipo, e?.code || "sin código");
    return false;
  }
}
