// Acciones del panel del personal sobre conversaciones, citas y documentos.
import { textoVisible, PREFIJO_PERSONAL } from "./mensajes.js";

const VENTANA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_CITA = ["confirmada", "rechazada", "atendida"];
const ESTADOS_DOC = ["recibido", "aprobado", "observado"];
const TURNO_MS = 30 * 1000;

const legible = (historial) => historial.map(textoVisible).filter(Boolean);
const canalDe = (telefono) => (String(telefono).startsWith("web:") ? "web" : "whatsapp");

export function crearPanel({ almacen, whatsapp, contenido, ahora = () => new Date(), esperar = (ms) => new Promise((r) => setTimeout(r, ms)), plantillas = {} }) {
  async function dentroDeVentana(conversacionId) {
    const c = await almacen.conversacionPorId(conversacionId);
    if (c && canalDe(c.telefono) === "web") return false;   // el chat web no tiene canal para escribirle al cliente
    return ahora().getTime() - (await almacen.ultimoMensajeCliente(conversacionId)) <= VENTANA_MS;
  }
  // El personal escribe en la conversación con el mismo turno que el asistente, para no mezclar mensajes a mitad de una respuesta.
  async function conTurno(conversacionId, fn) {
    for (let intento = 0; intento < 6; intento++) {
      if (await almacen.tomarTurno(conversacionId, ahora().getTime(), TURNO_MS)) {
        try { return await fn(); } finally { await almacen.liberarTurno(conversacionId); }
      }
      await esperar(1500);
    }
    throw new Error("El asistente está respondiendo a este cliente en este momento. Intenta de nuevo en unos segundos.");
  }
  // Envía un mensaje del personal y lo deja en la conversación para que el asistente lo vea si la retoma.
  async function enviarComoPersonal(conv, texto) {
    await conTurno(conv.id, async () => {
      await whatsapp.enviarTexto(conv.telefono, texto);
      const sesion = await almacen.sesionActual(conv.id);
      if (sesion) await almacen.agregarMensajes(sesion.id, [{ role: "assistant", content: [{ type: "text", text: PREFIJO_PERSONAL + texto }] }], ahora().getTime());
    });
  }
  async function conversacion(id) {
    const c = await almacen.conversacionPorId(id);
    if (!c) throw new Error("Conversación no encontrada");
    return c;
  }

  return {
    async conversaciones() {
      const filas = (await almacen.resumenConversaciones()).map(({ ultimoTexto, ...c }) => ({ ...c, ultimo: ultimoTexto, canal: canalDe(c.telefono) }));
      return filas.sort((a, b) => (b.derivada - a.derivada) || (b.ultimaActividad - a.ultimaActividad));
    },

    async detalle(id) {
      const c = await conversacion(id);
      const C = await contenido();
      const nombreDe = (tid) => (C.data.tramites.find((t) => t.id === tid) || {}).nombre || "Por definir";
      return {
        conversacion: c,
        canal: canalDe(c.telefono),
        puedeResponder: await dentroDeVentana(id),
        mensajes: legible(await almacen.historial(id)),
        citas: (await almacen.solicitudesCita(id)).map((x) => ({ ...x, tramite: nombreDe(x.tramiteId) })),
        documentos: (await almacen.documentos(id)).map(({ bytes, ...d }) => ({ ...d, tramite: d.tramiteId ? nombreDe(d.tramiteId) : "" }))
      };
    },

    async responder(id, texto) {
      const c = await conversacion(id);
      if (!String(texto || "").trim()) throw new Error("El mensaje está vacío");
      if (canalDe(c.telefono) === "web") throw new Error("Esta conversación es del chat de la página web: no se puede responder desde aquí. Si el cliente dejó su celular, contáctalo por WhatsApp o teléfono.");
      if (!(await dentroDeVentana(id))) throw new Error("Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite escribirle con una plantilla aprobada. Llámalo por teléfono.");
      await enviarComoPersonal(c, texto.trim());
    },

    async devolverAlAsistente(id) { await almacen.actualizarConversacion(id, { derivada: false }); },

    async decidirCita(citaId, estado, motivo = "") {
      if (!ESTADOS_CITA.includes(estado)) throw new Error(`Estado de cita inválido: ${estado}`);
      const cita = await almacen.cita(citaId);
      if (!cita) throw new Error("Cita no encontrada");
      await almacen.actualizarCita(citaId, { estado, motivo });
      if (estado === "atendida") return { avisado: false };
      const c = await conversacion(cita.conversacionId), C = await contenido();
      const tramite = (C.data.tramites.find((t) => t.id === cita.tramiteId) || {}).nombre;
      const dia = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(cita.fecha + "T12:00:00Z"));
      const texto = estado === "confirmada"
        ? `Hola ${cita.nombre}, tu cita${tramite ? " para " + tramite : ""} quedó confirmada para el ${dia} a las ${cita.hora} en la ${C.notaria.nombre} (${C.notaria.direccion}). Recuerda traer tus documentos originales.`
        : `Hola ${cita.nombre}, no pudimos confirmar tu cita del ${dia} a las ${cita.hora}${motivo ? ": " + motivo : ""}. Escríbenos otro horario que te convenga y te ayudamos.`;
      if (await dentroDeVentana(c.id)) { await enviarComoPersonal(c, texto); return { avisado: true }; }
      // Fuera de la ventana de 24 h (o en citas del chat web) WhatsApp solo permite plantillas aprobadas.
      const plantilla = estado === "confirmada" ? plantillas.citaConfirmada : plantillas.citaRechazada;
      const destino = cita.contacto || (canalDe(c.telefono) === "whatsapp" ? c.telefono : null);
      if (!plantilla || !destino) return { avisado: false };
      await whatsapp.enviarPlantilla(destino, plantilla, estado === "confirmada" ? [cita.nombre, tramite || "tu trámite", dia, cita.hora] : [cita.nombre, dia, cita.hora]);
      return { avisado: true };
    },

    async revisarDocumento(id, estado, nota = "") {
      if (!ESTADOS_DOC.includes(estado)) throw new Error(`Estado de documento inválido: ${estado}`);
      const d = await almacen.documento(id);
      if (!d) throw new Error("Documento no encontrado");
      await almacen.revisarDocumento(id, { estado, nota });
      if (estado === "recibido") return { avisado: false };
      const c = await conversacion(d.conversacionId);
      if (!(await dentroDeVentana(c.id))) return { avisado: false };
      await enviarComoPersonal(c, estado === "aprobado"
        ? `Revisamos tu documento «${d.descripcion}»: está correcto.`
        : `Revisamos tu documento «${d.descripcion}» y tiene una observación: ${nota || "por favor, revísalo"}. Envíalo de nuevo o escríbenos si tienes dudas.`);
      return { avisado: true };
    },

    async urlDocumento(id) { return almacen.urlDocumento(id); },
    async borrarDocumento(id) { await almacen.borrarDocumento(id); }
  };
}
