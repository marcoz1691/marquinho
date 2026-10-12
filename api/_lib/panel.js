import { FUNCIONES, leerFunciones } from "./funciones.js";
import { registrar, canalDeTelefono, CLAVES, PRECIOS } from "./metricas.js";
import { reglasCitas, fechaQuito, fechaValida, duracionValida, seCruzan } from "./citas.js";
import { minutos } from "../../js/nucleo.js";
// Acciones del panel del personal sobre conversaciones, citas y documentos.
import { textoVisible, PREFIJO_PERSONAL } from "./mensajes.js";
import { Aviso } from "./errores.js";
import { esHabilitante } from "../../js/nucleo.js";

const VENTANA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_CITA = ["confirmada", "rechazada", "atendida"];
const ESTADOS_DOC = ["recibido", "aprobado", "observado"];
const TURNO_MS = 30 * 1000;

const legible = (historial) => historial.map(textoVisible).filter(Boolean);
// Texto libre del personal: sin caracteres de control y con un largo máximo.
const limpio = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
export const canalDe = canalDeTelefono;

export function crearPanel({ almacen, whatsapp, contenido, ahora = () => new Date(), esperar = (ms) => new Promise((r) => setTimeout(r, ms)), plantillas = {} }) {
  async function dentroDeVentana(conversacionId) {
    const c = await almacen.conversacionPorId(conversacionId);
    if (c && canalDe(c.telefono) !== "whatsapp") return false;   // el chat web y el formulario no tienen canal para responder
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
    const C = await contenido({ oficial: true });
    if (!C.data.tramites.some((t) => t.id === id)) throw new Aviso("Trámite no encontrado.");
    return C;
  }

  const fallo = (mensaje, status = 400) => { throw Object.assign(new Aviso(mensaje), { status }); };
  const correo = v => {
    const email = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fallo("Escribe un correo válido.");
    return email;
  };
  async function permitir(por, roles, mensaje = "No tienes permiso para cambiar este perfil.") {
    const rol = await almacen.rolDe(por);
    if (!roles.includes(rol)) fallo(mensaje, 403);
    return rol;
  }
  async function personaAusencias(email, por) {
    email = correo(email || por);
    const rol = await almacen.rolDe(por);
    if (email !== por && !["admin", "notario"].includes(rol)) fallo("Tu perfil Personal solo puede gestionar tus propias ausencias.", 403);
    const p = (await almacen.equipo()).find(p => p.email === email);
    if (!p) fallo("Esa persona no está en el equipo.", 404);
    return p;
  }
  async function editarHorarios(por) {
    await permitir(por, ["admin", "notario"], "Tu perfil Personal no puede cambiar horarios ni la duración de las citas; pide ayuda al notario o a un administrador.");
  }
  return {
    async misAusencias(email, por) {
      const p = await personaAusencias(email, por);
      return { email: p.email, nombre: p.nombre, ausencias: p.ausencias.filter(a => a.hasta >= fechaQuito(ahora())), puedeEditar: true };
    },
    async guardarHorario({ email, atiendeCitas, horario }, por) {
      await editarHorarios(por);
      email = correo(email);
      if (typeof atiendeCitas !== "boolean" || !horario || typeof horario !== "object" || Array.isArray(horario)) fallo("Marca si atiende citas y elige un horario válido.");
      const horaValida = h => typeof h === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(h) && minutos(h) % 5 === 0;
      for (const [dia, tramos] of Object.entries(horario)) {
        if (!/^[0-6]$/.test(dia) || !Array.isArray(tramos) || tramos.length > 3) fallo("Cada día debe tener hasta tres tramos; usa días de lunes a domingo.");
        let fin = -1;
        for (const tramo of tramos) {
          if (!Array.isArray(tramo) || tramo.length !== 2 || !tramo.every(horaValida) || minutos(tramo[0]) >= minutos(tramo[1]) || minutos(tramo[0]) < fin) fallo("Elige horas válidas en múltiplos de cinco minutos, ordenadas y sin cruces; Desde debe ser anterior a Hasta.");
          fin = minutos(tramo[1]);
        }
      }
      if (!(await almacen.rolDe(email))) fallo("Esa persona no está en el equipo.", 404);
      await almacen.guardarHorario(email, { atiendeCitas, horario });
      return { ok: true, ...await this.equipo(por) };
    },
    async guardarAusencias({ email, ausencias }, por) {
      const p = await personaAusencias(email, por);
      if (!Array.isArray(ausencias) || ausencias.length > 24) fallo("Puedes registrar hasta 24 ausencias.");
      const hoy = fechaQuito(ahora());
      for (const a of ausencias) {
        if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).some(k => !["desde", "hasta", "motivo"].includes(k)) || !fechaValida(a.desde) || !fechaValida(a.hasta) || a.desde > a.hasta || typeof a.motivo !== "string" || a.motivo.length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(a.motivo)) fallo("Elige fechas válidas y un motivo de hasta 80 caracteres sin caracteres de control.");
      }
      ausencias = ausencias.filter(a => a.hasta >= hoy).map(a => ({ desde: a.desde, hasta: a.hasta, motivo: a.motivo }));
      await almacen.guardarAusencias(p.email, ausencias);
      return { ok: true, ausencias };
    },
    async guardarDuracionCita({ minutos }, por) {
      await editarHorarios(por);
      if (!duracionValida(minutos)) fallo("Elige una duración entre 30 y 240 minutos, en múltiplos de 30.");
      await almacen.guardarAjuste("citas.duracionMin", minutos, por);
      return { ok: true, ...await this.citasConfig() };
    },
    async yo(email) { const p = (await almacen.equipo()).find(p => p.email === email); return { email, nombre: p?.nombre || "", rol: await almacen.rolDe(email) }; },
    async equipo(por) {
      const rol = await permitir(por, ["admin", "notario"]);
      return { miembros: await almacen.equipo(), yo: por, rol };
    },
    async invitarMiembro(b, por, redirectTo) {
      const actor = await permitir(por, ["admin", "notario"]), email = correo(b.email);
      const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
      if (nombre.length < 2 || nombre.length > 80 || /[\u0000-\u001f\u007f]/.test(nombre)) fallo("Escribe un nombre de 2 a 80 caracteres.");
      if (!["admin", "notario", "personal"].includes(b.rol)) fallo("Elige un perfil válido.");
      if (actor === "notario" && b.rol !== "personal") fallo("Solo puedes invitar al perfil Personal.", 403);
      if (await almacen.rolDe(email)) fallo("Esa persona ya está en el equipo.", 409);
      if (await almacen.contarUso("panel:invitaciones:" + por, VENTANA_MS, ahora().getTime()) > 20) fallo("Ya enviaste 20 invitaciones hoy. Intenta mañana.", 429);
      try { await almacen.agregarMiembro({ email, nombre, rol: b.rol }); }
      catch (e) { if (e.code === "23505") fallo("Esa persona ya está en el equipo.", 409); throw e; }
      let invitacion;
      try { invitacion = await almacen.invitar(email, redirectTo); }
      catch { await almacen.quitarMiembro(email); fallo("No se pudo enviar la invitación. Intenta de nuevo.", 502); }
      return { ok: true, ...await this.equipo(por), ...invitacion, ...(invitacion.yaTeniaCuenta ? { aviso: "Ya tenía cuenta: puede entrar con su contraseña o usar ¿Olvidaste tu contraseña?" } : {}) };
    },
    async quitarMiembro(b, por) {
      const actor = await permitir(por, ["admin", "notario"]), email = correo(b.email);
      if (email === String(por).toLowerCase()) fallo("No puedes darte de baja a ti mismo.");
      const miembros = await almacen.equipo(), p = miembros.find(p => p.email === email);
      if (!p) fallo("Esa persona no está en el equipo.", 404);
      if (actor === "notario" && p.rol !== "personal") fallo("Solo puedes dar de baja al perfil Personal.", 403);
      if (p.rol === "admin" && miembros.filter(p => p.rol === "admin").length <= 1) fallo("No puedes dar de baja al último administrador.");
      await almacen.quitarMiembro(email);
      return { ok: true, ...await this.equipo(por) };
    },
    async cambiarRol(b, por) {
      await permitir(por, ["admin"]);
      const email = correo(b.email);
      if (email === String(por).toLowerCase()) fallo("No puedes cambiar tu propio perfil.");
      if (!["admin", "notario", "personal"].includes(b.rol)) fallo("Elige un perfil válido.");
      const miembros = await almacen.equipo(), p = miembros.find(p => p.email === email);
      if (!p) fallo("Esa persona no está en el equipo.", 404);
      if (p.rol === "admin" && b.rol !== "admin" && miembros.filter(p => p.rol === "admin").length <= 1) fallo("No puedes cambiar el perfil del último administrador.");
      await almacen.cambiarRol(email, b.rol);
      return { ok: true, ...await this.equipo(por) };
    },
    async funciones() {
      const detalles = await almacen.ajustesConDetalle();
      const f = leerFunciones(Object.fromEntries(detalles.map(r => [r.clave, r.valor])));
      return { funciones: FUNCIONES.map(x => {
        const d = detalles.find(r => r.clave === "funcion." + x.id);
        return { ...x, activa: f[x.id], actualizadoPor: d?.actualizadoPor || "", actualizadoEn: d?.actualizadoEn || "" };
      }) };
    },
    async guardarFuncion({ id, activa }, por) {
      if (!FUNCIONES.some(f => f.id === id) || typeof activa !== "boolean") throw new Aviso("Elige una función y un estado válidos.");
      await almacen.guardarAjuste("funcion." + id, activa ? "1" : "0", por);
      return { ok: true, ...await this.funciones() };
    },
    async metricas(desde, hasta) {
      const hoy = fechaQuito(ahora());
      hasta ??= hoy;
      if (!fechaValida(hasta)) throw new Aviso("Elige una fecha válida.");
      desde ??= fechaQuito(new Date(new Date(hasta + "T12:00:00Z").getTime() - 29 * 864e5));
      if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta || (Date.parse(hasta) - Date.parse(desde)) / 864e5 > 365) throw new Aviso("Elige fechas válidas y un período de hasta 366 días.");
      const ajustes = await almacen.ajustes(), filas = await almacen.metricas(desde, hasta);
      const totales = Object.fromEntries(CLAVES.map(k => [k, 0])), dias = new Map();
      for (const r of filas) {
        totales[r.clave] = (totales[r.clave] || 0) + r.valor;
        if (!dias.has(r.fecha)) dias.set(r.fecha, {});
        const v = dias.get(r.fecha);
        v[r.clave] = (v[r.clave] || 0) + r.valor;
      }
      const precios = Object.fromEntries(Object.entries(PRECIOS).map(([k, v]) => {
        const guardado = ajustes["metricas.precio." + k], n = Number(guardado);
        return [k, guardado != null && Number.isFinite(n) && n >= 0 && n <= 1000 ? n : v];
      }));
      const ia = (totales["ia.tokens_entrada"] * precios.entrada + totales["ia.tokens_salida"] * precios.salida + totales["ia.tokens_cache_lectura"] * precios.cacheLectura + totales["ia.tokens_cache_escritura"] * precios.cacheEscritura) / 1e6;
      const whatsapp = (totales["recordatorio.enviado"] + totales["respuesta.automatica"]) * precios.plantillaWhatsapp;
      const conversaciones = ["whatsapp", "web", "formulario"].reduce((s,c) => s + totales["conv.nueva." + c], 0);
      return { desde, hasta, pilotoInicio: ajustes["piloto.inicio"] || null, totales, porDia: [...dias].sort(([a],[b]) => a.localeCompare(b)).map(([fecha,valores]) => ({ fecha, valores })), precios, costo: { ia, whatsapp, total: ia + whatsapp, porConversacion: conversaciones ? ia / conversaciones : 0 } };
    },
    async guardarPreciosMetricas(b, por) {
      for (const k of Object.keys(PRECIOS)) if (typeof b[k] !== "number" || !Number.isFinite(b[k]) || b[k] < 0 || b[k] > 1000) throw new Aviso("Escribe precios entre 0 y 1000.");
      for (const k of Object.keys(PRECIOS)) await almacen.guardarAjuste("metricas.precio." + k, b[k], por);
      return this.metricas();
    },
    async guardarInicioPiloto({ fecha }, por) {
      if (fecha !== null && !fechaValida(fecha)) throw new Aviso("Elige una fecha válida.");
      await almacen.guardarAjuste("piloto.inicio", fecha || "", por);
      return this.metricas();
    },
    async citasConfig() {
      const r = reglasCitas(await contenido(), await almacen.ajustes());
      return { duracionMin: r.duracionMin, modoHorarios: (await almacen.matriceros()).some(p => p.horario !== null) ? "matriceros" : "cupoFijo", porHora:r.porHora, porHoraOficial:r.porHoraOficial, bloqueos:r.bloqueos.filter(b=>b.fecha>=fechaQuito(ahora())) };
    },
    async guardarCupo({porHora}, por) {
      if (!Number.isInteger(porHora) || porHora<1 || porHora>20) throw new Aviso("El cupo debe ser un entero de 1 a 20.");
      await almacen.guardarAjuste("citas.porHora", String(porHora), por);
      return {ok:true, ...await this.citasConfig()};
    },
    async agregarBloqueo({fecha,hora=null,motivo=""}, por) {
      const C=await contenido(), H=C.notaria.horario;
      if (!fechaValida(fecha) || fecha<fechaQuito(ahora())) throw new Aviso("Elige una fecha válida de hoy en adelante.");
      if (hora!==null && (typeof hora!=="string" || !/^(?:[01]\d|2[0-3]):00$/.test(hora) || minutos(hora)<minutos(H.abre) || minutos(hora)>=minutos(H.cierra))) throw new Aviso("Elige una hora completa dentro del horario de atención.");
      if (typeof motivo!=="string" || motivo.length>80) throw new Aviso("Escribe un motivo de hasta 80 caracteres.");
      const r=reglasCitas(C,await almacen.ajustes()), bloques=r.bloqueos.filter(b=>!b.fijo);
      if(!r.bloqueos.some(b=>b.fecha===fecha && b.hora===hora)) bloques.push({fecha,hora,motivo:limpio(motivo,80)});
      await almacen.guardarAjuste("citas.bloqueos", JSON.stringify(bloques), por);
      return {ok:true, ...await this.citasConfig()};
    },
    async quitarBloqueo({fecha,hora=null}, por) {
      if(!fechaValida(fecha) || (hora!==null && !/^(?:[01]\d|2[0-3]):00$/.test(hora))) throw new Aviso("Elige un bloqueo válido.");
      const r=reglasCitas(await contenido(),await almacen.ajustes());
      if(r.bloqueos.some(b=>b.fijo && b.fecha===fecha && b.hora===hora)) throw new Aviso("No puedes quitar un feriado.");
      await almacen.guardarAjuste("citas.bloqueos",JSON.stringify(r.bloqueos.filter(b=>!b.fijo && !(b.fecha===fecha && b.hora===hora))),por);
      return {ok:true, ...await this.citasConfig()};
    },
    async precios() {
      const C = await contenido({ oficial: true }), filas = await almacen.precios(), ajustes = await almacen.ajustes();
      return { tarifas: { ...C.tarifas, ...ajustes }, sbuEditado: ajustes.sbu !== undefined || ajustes.anio !== undefined, sbuOficial: C.tarifas.sbu, anioOficial: C.tarifas.anio, tramites: C.data.tramites.map((t) => {
        const p = filas.find((p) => p.tramiteId === t.id);
        return { ...t, tarifa: p ? { tipo: p.tipo, valor: p.valor, unidad: p.unidad, tabla: p.tabla } : t.tarifa,
          editada: !!p, actualizadoPor: p?.actualizadoPor || "", actualizadoEn: p?.actualizadoEn || "" };
      }) };
    },
    async guardarPrecio(p, por) {
      const C = await tramitePrecio(p.tramiteId);
      if (!["pct", "fija", "cuantia", "consultar"].includes(p.tipo)) throw new Aviso("Tipo de precio inválido.");
      const oficial = C.data.tramites.find((t) => t.id === p.tramiteId);
      // Copias y materializaciones se suman al total de la calculadora y de Sofía: sin precio por hoja su costo desaparecería.
      if (esHabilitante(p.tramiteId) && !["pct", "fija"].includes(p.tipo)) throw new Aviso("Las copias certificadas y las materializaciones son documentos habilitantes: deben tener un precio por hoja (valor fijo o porcentaje del SBU).");
      if (p.tipo === "pct" && !(typeof p.valor === "number" && p.valor >= 0.001 && p.valor <= 5)) throw new Aviso("El porcentaje del SBU debe estar entre 0,1 % y 500 %.");
      if (p.tipo === "fija" && !(typeof p.valor === "number" && p.valor >= 0.01 && p.valor <= 1000)) throw new Aviso("El valor fijo debe estar entre $0,01 y $1000.");
      // Si el trámite se cobra por unidad (por hoja, por firma…), la unidad debe seguir diciéndolo: de lo contrario la cantidad deja de multiplicar.
      if (["pct", "fija"].includes(p.tipo) && /por/.test(oficial?.tarifa?.unidad || "") && !/por/.test(p.unidad || "")) throw new Aviso("Este trámite se cobra por unidad: la unidad debe empezar con «por» (por hoja, por firma…).");
      if (p.tipo === "cuantia" && !Object.hasOwn(C.tarifas.tablas || {}, p.tabla)) throw new Aviso("Tabla de cuantía inválida.");
      if (typeof (p.unidad ?? "") !== "string" || !/^[\p{L}\p{N} .,/-]{0,30}$/u.test(p.unidad || "")) throw new Aviso("La unidad puede tener hasta 30 letras, números o signos simples (por ejemplo «por hoja»).");
      await almacen.guardarPrecio({ tramiteId: p.tramiteId, tipo: p.tipo, valor: ["pct", "fija"].includes(p.tipo) ? p.valor : null,
        unidad: (p.unidad || "").trim(), tabla: p.tipo === "cuantia" ? p.tabla : "", actualizadoPor: por });
    },
    async restaurarPrecio(id) { await tramitePrecio(id); await almacen.restaurarPrecio(id); },
    // Vuelve al SBU y al año de la hoja de Google (si no, un valor guardado aquí taparía para siempre los cambios de la hoja).
    async restaurarSBU() { await almacen.restaurarAjuste("sbu"); await almacen.restaurarAjuste("anio"); },
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
        citas: (await almacen.solicitudesCita(id)).map(x => ({ ...x, canal: canalDe(c.telefono), tramite: nombreDe(x.tramiteId) })),
        documentos: (await almacen.documentos(id)).map(({ bytes, ...d }) => ({ ...d, tramite: d.tramiteId ? nombreDe(d.tramiteId) : "" }))
      };
    },

    async responder(id, texto) {
      const c = await conversacion(id);
      if (!String(texto || "").trim()) throw new Aviso("El mensaje está vacío");
      if (String(texto).length > 2000) throw new Aviso("El mensaje es muy largo (máximo 2000 caracteres).");
      if (canalDe(c.telefono) !== "whatsapp") throw new Aviso("Esta conversación es del chat de la página web o del formulario: no se puede responder desde aquí. Si el cliente dejó su celular, contáctalo por WhatsApp o teléfono.");
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
      const equipo = await almacen.equipo();
      return { fecha, personal: await almacen.listaPersonal(), citas: (await almacen.agenda(fecha)).map((x) => ({ ...x, asignadaNombre: equipo.find(p => p.email === x.asignadaA)?.nombre || x.asignadaA || "", canal: canalDe(x.telefonoConversacion), tramite: nombreDe(x.tramiteId) })) };
    },

    async buscarTicket(codigo) {
      if (!/^[1-9]\d{3}$/.test(codigo || "")) throw new Aviso("Escribe un ticket válido de 4 dígitos.");
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora());
      const C = await contenido();
      return (await almacen.citasPorCodigo(codigo, hoy)).map((x) => ({ ...x, canal: canalDe(x.telefonoConversacion), tramite: (C.data.tramites.find((t) => t.id === x.tramiteId) || {}).nombre || "Por definir" }));
    },

    async asignarCita(citaId, persona) {
      const cita = await almacen.cita(citaId);
      if (!cita) throw new Aviso("Cita no encontrada");
      if (typeof persona !== "string" || persona.length > (persona.includes("@") ? 254 : 60)) throw new Aviso("El nombre o correo de la persona asignada es demasiado largo.");
      persona = limpio(persona, 254);
      const equipo = await almacen.equipo(), p = equipo.find(p => p.email === persona || p.nombre === persona);
      const r = reglasCitas(await contenido(), await almacen.ajustes());
      const cruce = p && (await almacen.agenda(cita.fecha)).some(c => c.id !== citaId && ["pendiente", "confirmada"].includes(c.estado) && [p.email, p.nombre].includes(c.asignadaA) && seCruzan(c.hora, cita.hora, r.duracionMin));
      await almacen.actualizarCita(citaId, { asignadaA: persona });
      return { ok: true, ...(cruce ? { aviso: `${p.nombre} ya tiene una cita a esa hora` } : {}) };
    },

    async decidirCita(citaId, estado, motivo = "") {
      motivo = limpio(motivo, 200);
      if (!ESTADOS_CITA.includes(estado)) throw new Aviso(`Estado de cita inválido: ${estado}`);
      const cita = await almacen.cita(citaId);
      if (!cita) throw new Aviso("Cita no encontrada");
      if (cita.estado === estado) throw new Aviso(`La cita ya está ${estado}.`);
      if (cita.estado === "rechazada" || cita.estado === "atendida") throw new Aviso("Esta cita ya se cerró; si el cliente quiere otra, que la pida de nuevo.");
      await almacen.actualizarCita(citaId, { estado, motivo });
      if (["atendida", "rechazada"].includes(estado)) await registrar(almacen, estado === "atendida" ? "cita.atendida" : "cita.cancelada", 1, ahora());
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
