import { errorWeb } from "./funciones.js";
import { registrar } from "./metricas.js";
import { huellaIp } from "./huella.js";
import { celular, fechaQuito, fechaValida, sumarDias, horasLibres, diasDisponibles } from "./citas.js";
import { construirResumen } from "./resumen.js";
import { AVISO_PRIVACIDAD } from "./privacidad.js";
import { registrarConsentimiento } from "./consentimiento.js";
const CITA_ACTIVA = "Ya tienes una cita activa con este celular. Si necesitas cambiarla o no recuerdas tu ticket, escríbenos por WhatsApp o llámanos.";
const TEXTO_FORMULARIO = "Casillas de la web: acepto los términos y condiciones; autorizo el tratamiento de mis datos según el aviso de privacidad";
const HORA = 3600e3,
  DIA = 864e5;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const huella = huellaIp;
export function crearManejadorCita({
  almacen,
  contenido,
  avisar = async () => {},
  ahora = () => new Date(),
  limites = { consultas: 120, porIp: 5, porCelular: 3, porDia: 200 }
}) {
  const disponibilidad = (C, ajustes, t) => diasDisponibles({ almacen, C, ajustes, desde: fechaQuito(t), ahora: t });
  return {
    async GET(request) {
      // Lectura estricta: sin ajustes no se conocen los cupos ni los bloqueos, así que no se agenda a ciegas.
      const ajustes = await almacen.ajustes(), apagada = errorWeb(ajustes, "agenda");
      if (apagada) return json(apagada, 503);
      const t = new Date(ahora());
      if ((await almacen.contarUso("cita:get:" + huella(request), HORA, t.getTime())) > limites.consultas)
        return json({ error: "Hiciste muchas consultas. Espera un momento o escríbenos por WhatsApp." }, 429);
      const C = await contenido();
      return json({
        dias: await disponibilidad(C, ajustes, t),
        horario: C.notaria.horario.texto,
        tramites: C.data.tramites.map(({ id, nombre, cat }) => ({ id, nombre, cat })),
        categorias: (C.data.categorias || []).map(({ id, nombre }) => ({ id, nombre }))
      });
    },
    async POST(request) {
      // Lectura estricta: sin ajustes no se conocen los cupos ni los bloqueos, así que no se agenda a ciegas.
      const ajustes = await almacen.ajustes(), apagada = errorWeb(ajustes, "agenda");
      if (apagada) return json(apagada, 503);
      let b;
      try {
        b = await request.json();
      } catch {
        return json({ error: "Revisa los datos de tu solicitud." }, 400);
      }
      if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "Revisa los datos de tu solicitud." }, 400);
      const t = new Date(ahora()),
        C = await contenido(),
        hoy = fechaQuito(t);
      if (typeof b.sitio === "string" && b.sitio.trim())
        return json(
          {
            resumen: construirResumen({ codigo: "1000", estado: "confirmada", fecha: hoy, hora: "09:00", nombre: "Visitante", tramiteId: null }, C, {
              subirDocumentos: false
            })
          },
          201
        );
      const nombre = typeof b.nombre === "string" ? b.nombre.normalize("NFC").trim() : "",
        contacto = celular(b.celular);
      const tramite = b.tramiteId == null ? null : C.data.tramites.find((x) => x.id === b.tramiteId);
      if (nombre.length < 2 || nombre.length > 80 || /[\u0000-\u001f\u007f]/.test(nombre))
        return json({ error: "Escribe tu nombre de 2 a 80 caracteres." }, 400);
      if (!contacto || !/^5939\d{8}$/.test(contacto)) return json({ error: "Escribe tu celular de Ecuador, por ejemplo 0991234567." }, 400);
      // Dos aceptaciones separadas (LOPDP, art. 8): los términos del servicio y el tratamiento de datos, que no se mezclan.
      if (b.aceptaTerminos !== true) return json({ error: "Acepta los términos y condiciones para agendar tu cita." }, 400);
      if (b.aceptaDatos !== true) return json({ error: "Autoriza el tratamiento de tus datos para agendar tu cita." }, 400);
      if (b.tramiteId != null && !tramite) return json({ error: "Elige un trámite de la lista o «Aún no sé / otro»." }, 400);
      if (b.nota != null && (typeof b.nota !== "string" || b.nota.length > 200)) return json({ error: "Escribe una nota de hasta 200 caracteres." }, 400);
      if (!fechaValida(b.fecha) || typeof b.hora !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b.hora))
        return json({ error: "Elige un día y una hora válidos." }, 400);
      // Cuenta intentos válidos, también los que encuentran una cita activa o un cupo ocupado.
      const nCel = await almacen.contarUso("cita:celular:" + contacto, DIA, t.getTime());
      if (nCel > limites.porCelular) return json({ error: "Ya intentaste agendar varias veces hoy. Escríbenos por WhatsApp o llámanos." }, 429);
      const previa = await almacen.conversacionPorTelefono("form:" + contacto);
      const activa =
        previa &&
        (await almacen.solicitudesCita(previa.id)).find(
          (c) => ["pendiente", "confirmada"].includes(c.estado) && new Date(c.fecha + "T" + c.hora + ":00-05:00") > t
        );
      // No se revelan la fecha, la hora ni el ticket: con solo saber un celular, cualquiera podría obtenerlos.
      if (activa) return json({ error: CITA_ACTIVA }, 409);
      if (b.fecha < hoy || b.fecha > sumarDias(hoy, 29) || !(await horasLibres({ almacen, C, ajustes, fecha: b.fecha, ahora: t })).includes(b.hora))
        return json({ error: "Esa hora acaba de ocuparse. Elige otra.", dias: await disponibilidad(C, ajustes, t) }, 409);
      const [nIp, nDia] = await Promise.all([
        almacen.contarUso("cita:ip:" + huella(request), DIA, t.getTime()),
        almacen.contarUso("cita:dia", DIA, t.getTime())
      ]);
      if (nIp > limites.porIp || nDia > limites.porDia)
        return json({ error: "Hoy recibimos muchas reservas. Escríbenos por WhatsApp o llámanos para agendar." }, 429);
      const conv = await almacen.conversacion("form:" + contacto, nombre);
      if (!previa) await registrar(almacen, "conv.nueva.formulario", 1, t);
      await almacen.actualizarConversacion(conv.id, {
        nombre,
        consentimiento: true,
        consentimientoEn: t.toISOString(),
        consentimientoTexto: TEXTO_FORMULARIO,
        consentimientoAviso: AVISO_PRIVACIDAD
      });
      await registrarConsentimiento(almacen, { canal: "formulario", titular: contacto, texto: TEXTO_FORMULARIO, t });
      const cita = {
        conversacionId: conv.id,
        nombre,
        contacto,
        tramiteId: tramite?.id || null,
        fecha: b.fecha,
        hora: b.hora,
        nota: (b.nota || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim(),
        estado: tramite?.revision ? "pendiente" : "confirmada"
      };
      const nueva = await almacen.crearSolicitudCita(cita);
      await registrar(almacen, "cita.creada.formulario", 1, t);
      if (cita.estado === "pendiente")
        await avisar(`Nueva solicitud de cita (formulario): ${nombre} (${contacto}) — ${tramite.nombre} — ${cita.fecha} ${cita.hora}. Confírmala en el panel.`);
      else if (cita.fecha === hoy)
        await avisar(
          `Cita para hoy confirmada (formulario): ${nombre} (${contacto}) — ${tramite?.nombre || "trámite por definir"} — hoy a las ${cita.hora}. Asígnala en el panel.`
        );
      return json({ resumen: construirResumen({ ...cita, ...nueva }, C, { subirDocumentos: false }) }, 201);
    }
  };
}
