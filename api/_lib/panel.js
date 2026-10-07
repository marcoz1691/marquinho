// Acciones del panel del personal sobre conversaciones, citas y documentos.
import { textoVisible, PREFIJO_PERSONAL } from "./mensajes.js";
import { Aviso } from "./errores.js";

const VENTANA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_CITA = ["confirmada", "rechazada", "atendida"];
const ESTADOS_DOC = ["recibido", "aprobado", "observado"];
const TURNO_MS = 30 * 1000;

const legible = (historial) => historial.map(textoVisible).filter(Boolean);
// Texto libre del personal: sin caracteres de control y con un largo máximo.
const limpio = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
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
    throw new Aviso("El asistente está respondiendo a este cliente en este momento. Intenta de nuevo en unos segundos.");
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
    if (!c) throw new Aviso("Conversación no encontrada");
    return c;
  }

  async function tramitePrecio(id) {
    const C = await contenido();
    if (!C.data.tramites.some((t) => t.id === id)) throw new Aviso("Trámite no encontrado.");
    return C;
  }

  return {
    async precios() {
      const C = await contenido({ oficial: true }), filas = await almacen.precios(), ajustes = await almacen.ajustes();
      return { tarifas: { ...C.tarifas, ...ajustes }, tramites: C.data.tramites.map((t) => {
        const p = filas.find((p) => p.tramiteId === t.id);
        return { ...t, tarifa: p ? { tipo: p.tipo, valor: p.valor, unidad: p.unidad, tabla: p.tabla } : t.tarifa,
          editada: !!p, actualizadoPor: p?.actualizadoPor || "", actualizadoEn: p?.actualizadoEn || "" };
      }) };
    },
    async guardarPrecio(p, por) {
      const C = await tramitePrecio(p.tramiteId);
      if (!["pct", "fija", "cuantia", "consultar"].includes(p.tipo)) throw new Aviso("Tipo de precio inválido.");
      if (["pct", "fija"].includes(p.tipo) && (typeof p.valor !== "number" || !Number.isFinite(p.valor) || p.valor <= 0 || p.valor > 10000)) throw new Aviso("El valor debe ser un número mayor que 0 y de hasta 10000.");
      if (p.tipo === "cuantia" && !Object.hasOwn(C.tarifas.tablas || {}, p.tabla)) throw new Aviso("Tabla de cuantía inválida.");
      if (typeof (p.unidad ?? "") !== "string" || (p.unidad || "").length > 30) throw new Aviso("La unidad debe tener hasta 30 caracteres.");
      await almacen.guardarPrecio({ tramiteId: p.tramiteId, tipo: p.tipo, valor: ["pct", "fija"].includes(p.tipo) ? p.valor : null,
        unidad: (p.unidad || "").trim(), tabla: p.tipo === "cuantia" ? p.tabla : "", actualizadoPor: por });
    },
    async restaurarPrecio(id) { await tramitePrecio(id); await almacen.restaurarPrecio(id); },
    async guardarSBU({ sbu, anio }, por) {
      if (typeof sbu !== "number" || !Number.isFinite(sbu) || sbu < 100 || sbu > 5000) throw new Aviso("El SBU debe estar entre 100 y 5000.");
      if (!/^\d{4}$/.test(String(anio))) throw new Aviso("El año debe tener 4 dígitos.");
      await almacen.guardarAjuste("sbu", sbu, por);
      await almacen.guardarAjuste("anio", String(anio), por);
    },
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
      if (!String(texto || "").trim()) throw new Aviso("El mensaje está vacío");
      if (String(texto).length > 2000) throw new Aviso("El mensaje es muy largo (máximo 2000 caracteres).");
      if (canalDe(c.telefono) === "web") throw new Aviso("Esta conversación es del chat de la página web: no se puede responder desde aquí. Si el cliente dejó su celular, contáctalo por WhatsApp o teléfono.");
      if (!(await dentroDeVentana(id))) throw new Aviso("Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite escribirle con una plantilla aprobada. Llámalo por teléfono.");
      await enviarComoPersonal(c, texto.trim());
    },

    async devolverAlAsistente(id) { await almacen.actualizarConversacion(id, { derivada: false }); },

    // Agenda de un día (por defecto, hoy en Quito) para repartir las citas entre el personal.
    async agenda(fecha) {
      fecha = fecha || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Aviso("Fecha inválida");
      const C = await contenido();
      const nombreDe = (tid) => (C.data.tramites.find((t) => t.id === tid) || {}).nombre || "Por definir";
      return { fecha, personal: await almacen.listaPersonal(), citas: (await almacen.agenda(fecha)).map((x) => ({ ...x, tramite: nombreDe(x.tramiteId) })) };
    },

    async asignarCita(citaId, persona) {
      if (!(await almacen.cita(citaId))) throw new Aviso("Cita no encontrada");
      if (String(persona || "").length > 60) throw new Aviso("El nombre de la persona asignada es demasiado largo.");
      await almacen.actualizarCita(citaId, { asignadaA: limpio(persona, 60) });
    },

    async decidirCita(citaId, estado, motivo = "") {
      motivo = limpio(motivo, 200);
      if (!ESTADOS_CITA.includes(estado)) throw new Aviso(`Estado de cita inválido: ${estado}`);
      const cita = await almacen.cita(citaId);
      if (!cita) throw new Aviso("Cita no encontrada");
      if (cita.estado === estado) throw new Aviso(`La cita ya está ${estado}.`);
      if (cita.estado === "rechazada" || cita.estado === "atendida") throw new Aviso("Esta cita ya se cerró; si el cliente quiere otra, que la pida de nuevo.");
      await almacen.actualizarCita(citaId, { estado, motivo });
      if (estado === "atendida") return { avisado: false };
      const c = await conversacion(cita.conversacionId), C = await contenido();
      const tramite = (C.data.tramites.find((t) => t.id === cita.tramiteId) || {}).nombre;
      const dia = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(cita.fecha + "T12:00:00Z"));
      const texto = estado === "confirmada"
        ? `Hola ${cita.nombre}, tu cita${tramite ? " para " + tramite : ""} quedó confirmada para el ${dia} a las ${cita.hora} en la ${C.notaria.nombre} (${C.notaria.direccion}). Recuerda traer tus documentos originales.`
        : `Hola ${cita.nombre}, ${cita.estado === "confirmada" ? "tuvimos que cancelar tu cita" : "no pudimos confirmar tu cita"} del ${dia} a las ${cita.hora}${motivo ? ": " + motivo : ""}. Escríbenos otro horario que te convenga y te ayudamos.`;
      if (await dentroDeVentana(c.id)) { await enviarComoPersonal(c, texto); return { avisado: true }; }
      // Fuera de la ventana de 24 h (o en citas del chat web) WhatsApp solo permite plantillas aprobadas.
      const plantilla = estado === "confirmada" ? plantillas.citaConfirmada : plantillas.citaRechazada;
      const destino = cita.contacto || (canalDe(c.telefono) === "whatsapp" ? c.telefono : null);
      if (!plantilla || !destino) return { avisado: false };
      try {
        await whatsapp.enviarPlantilla(destino, plantilla, estado === "confirmada" ? [cita.nombre, tramite || "tu trámite", dia, cita.hora] : [cita.nombre, dia, cita.hora]);
      } catch (e) {
        console.error("Plantilla de cita no enviada:", cita.id, e.message);
        return { avisado: false };
      }
      return { avisado: true };
    },

    async revisarDocumento(id, estado, nota = "") {
      nota = limpio(nota, 300);
      if (!ESTADOS_DOC.includes(estado)) throw new Aviso(`Estado de documento inválido: ${estado}`);
      const d = await almacen.documento(id);
      if (!d) throw new Aviso("Documento no encontrado");
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
    // Borrado recuperable: el documento sale del panel y el archivo se elimina en la limpieza diaria (ver purgar.js).
    async borrarDocumento(id, por = "") {
      if (!(await almacen.documento(id))) throw new Aviso("Documento no encontrado");
      await almacen.borrarDocumento(id, { por });
    }
  };
}
