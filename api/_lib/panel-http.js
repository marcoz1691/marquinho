// API HTTP del panel del personal. Exige un token de Supabase Auth de una persona registrada en la tabla "personal",
// con el correo confirmado y, si está activada, la verificación en dos pasos (aal2).
import { AsyncLocalStorage } from "node:async_hooks";
import { Aviso } from "./errores.js";

const HORA = 3600 * 1000;
const GENERICO = "No se pudo completar la acción. Intenta de nuevo en unos segundos.";
const SOLO_EDITORES_TRAMITES = "Solo el notario o un administrador puede editar los trámites.";
// «Ver como»: un administrador revisa el panel con el perfil de notario o de matricero (cabecera X-Ver-Como). Solo baja
// permisos, nunca los sube, y mientras dura no se guarda nada: todo POST se rechaza. La auditoría sigue con su correo real.
const VISTAS = ["notario", "matricero"];
const EN_VISTA_PREVIA = "Estás en vista previa: vuelve a Administrador para guardar cambios.";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function crearManejadorPanel({ panel, auth, exigirMfa = true, limiteDescargas = 60, ahora = () => Date.now(), avisar = async () => {} }) {
  const mfaRegistrada = new Set();
  // El perfil con el que se calculan los permisos de la petición en curso: el de la vista previa, si la hay, o el real.
  const vista = new AsyncLocalStorage();
  const rolDe = async (email) => vista.getStore() || auth.rolDe(email);
  async function verComo(request, email) {
    const v = String(request.headers.get("x-ver-como") || "").toLowerCase();
    return VISTAS.includes(v) && (await auth.rolDe(email)) === "admin" ? v : null;
  }
  async function autorizar(request) {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const usuario = token ? await auth.usuarioDeToken(token) : null;
    if (!usuario) return { no: json({ error: "Inicia sesión" }, 401) };
    if (!usuario.email_confirmed_at) return { no: json({ error: "Tu cuenta aún no confirmó su correo" }, 403) };
    if (exigirMfa && usuario.aal !== "aal2") return { no: json({ error: "Ingresa el código de tu app de verificación", mfa: true }, 401) };
    if (!(await auth.esPersonal(usuario.email))) return { no: json({ error: "Tu cuenta no está autorizada para el panel" }, 403) };
    const email = String(usuario.email).toLowerCase();
    // Primera vez con verificación en dos pasos: queda registrado y se avisa, para que el administrador note si alguien
    // distinto al dueño activó la verificación de una cuenta nueva (ver docs/notario: «activa tu verificación el mismo día»).
    // Se consulta una vez por persona y por instancia, no en cada pedido: ahorra una escritura en la base por clic.
    if (exigirMfa && !mfaRegistrada.has(email)) {
      let nueva = false;
      try { nueva = await auth.marcarMfa(email); mfaRegistrada.add(email); } catch {}
      if (nueva) {
        await auth.auditar({ email, accion: "mfa_activado", objetivo: email, ok: true }).catch(() => {});
        await avisar(`Se activó la verificación en dos pasos de ${email} en el panel. Si no fue esa persona, avisa de inmediato al administrador.`).catch(() => {});
      }
    }
    return { email, verComo: await verComo(request, email) };
  }
  // Las lecturas de datos personales y todas las acciones quedan en la auditoría, también si fallan.
  async function ejecutar(accion, objetivo, email, fn, auditar, estricta = false) {
    let ok = true;
    objetivo = String(objetivo ?? "").slice(0, 80);
    const registrar = (exito) => auth.auditar({ email, accion, objetivo, ok: exito });
    try {
      // Ver un documento exige poder dejar constancia: si la auditoría falla, no se entrega (falla cerrado).
      if (estricta) await registrar(true);
      return json((await fn()) ?? { ok: true });
    }
    catch (e) {
      ok = false;
      if (e instanceof Aviso) return json({ error: e.message }, e.status || 400);
      console.error(`Panel: error en "${accion}":`, e?.message || e);
      return json({ error: GENERICO }, 500);
    } finally {
      if (auditar && !estricta) await registrar(ok).catch((e) => console.error("Auditoría no registrada:", e?.message));
    }
  }

  async function exigir(email, roles, mensaje) {
    const rol = await rolDe(email);
    if (!roles.includes(rol)) throw Object.assign(new Aviso(mensaje), { status: 403 });
    return rol;
  }
  // En precios y cupos esAdmin significa «puede editar»: incluye al notario.
  async function comoAdmin(email, fn, mensaje = "Solo el notario o un administrador puede cambiar los precios.") {
    await exigir(email, ["admin", "notario"], mensaje);
    return fn();
  }
  async function cuposAdmin(email, fn) {
    const rol = await exigir(email, ["admin", "notario"], "Solo el notario o un administrador puede cambiar los cupos.");
    return { ...await fn(), esAdmin: true, rol };
  }
  // En funciones y métricas esAdmin significa exclusivamente administrador.
  async function pilotoAdmin(email, fn, funciones = false) {
    const rol = await exigir(email, ["admin"], funciones ? "Solo un administrador puede cambiar las funciones." : "Solo un administrador puede consultar o cambiar las métricas.");
    return { ...await fn(), esAdmin: true, rol };
  }
  async function editable(email, datos) {
    const rol = await rolDe(email);
    return { ...datos, rol, esAdmin: ["admin", "notario"].includes(rol) };
  }
  const lecturas = {
    yo: { fn: async (q, email) => ({ ...await panel.yo(email), ...(vista.getStore() && { rol: vista.getStore(), vistaPrevia: true }) }) },
    equipo: { auditar: true, fn: async (q, email) => { const rol = await exigir(email, ["admin", "notario"], "No tienes permiso para cambiar este perfil."); return { ...await panel.equipo(email), rol }; } },
    funciones: { fn: (q, email) => pilotoAdmin(email, () => panel.funciones(), true) },
    metricas: { auditar: true, fn: (q, email) => pilotoAdmin(email, () => panel.metricas(q.get("desde") ?? undefined, q.get("hasta") ?? undefined)) },
    citasConfig: { fn: async (q,email) => editable(email, await panel.citasConfig()) },
    precios: { auditar: true, fn: async (q, email) => editable(email, await panel.precios()) },
    conversaciones: { fn: () => panel.conversaciones() },
    buscarTicket: { fn: (q) => panel.buscarTicket(q.get("codigo")), auditar: true },
    agenda: { fn: (q) => panel.agenda(q.get("fecha")) },
    miTurno: { fn: (q, email) => panel.miTurno(email) },
    documentosDeCita: { fn: (q) => panel.documentosDeCita(q.get("id")), auditar: true },
    detalle: { fn: (q) => panel.detalle(q.get("id")), auditar: true },
    documento: { auditar: true, estricta: true, fn: async (q, email) => {
      if ((await auth.contarUso("panel:descargas:" + email, HORA, ahora())) > limiteDescargas) {
        throw Object.assign(new Aviso("Abriste muchos documentos en la última hora. Espera un momento o pide ayuda al administrador."), { status: 429 });
      }
      return { url: await panel.urlDocumento(q.get("id"), email) };
    } }
  };
  const acciones = {
    invitarMiembro: (b, email, request) => {
      const origen = process.env.SITIO_URL || request.headers.get("origin");
      let redirectTo;
      try { const url = new URL(origen); if (!["https:", "http:"].includes(url.protocol)) throw new Error(); redirectTo = url.origin + "/panel/"; }
      catch { throw new Aviso("No se pudo determinar la dirección del panel para la invitación."); }
      return panel.invitarMiembro(b, email, redirectTo);
    },
    quitarMiembro: (b, email) => panel.quitarMiembro(b, email),
    cambiarRol: (b, email) => panel.cambiarRol(b, email),
    guardarFuncion: (b, email) => pilotoAdmin(email, () => panel.guardarFuncion(b, email), true),
    guardarPreciosMetricas: (b, email) => pilotoAdmin(email, () => panel.guardarPreciosMetricas(b, email)),
    guardarInicioPiloto: (b, email) => pilotoAdmin(email, () => panel.guardarInicioPiloto(b, email)),
    guardarCupo: (b,email) => cuposAdmin(email, () => panel.guardarCupo(b,email)),
    agregarBloqueo: (b,email) => cuposAdmin(email, () => panel.agregarBloqueo(b,email)),
    quitarBloqueo: (b,email) => cuposAdmin(email, () => panel.quitarBloqueo(b,email)),
    guardarPrecio: (b, email) => comoAdmin(email, () => panel.guardarPrecio(b, email)),
    restaurarPrecio: (b, email) => comoAdmin(email, () => panel.restaurarPrecio(b.tramiteId)),
    guardarTexto: (b, email) => comoAdmin(email, () => panel.guardarTexto(b, email), SOLO_EDITORES_TRAMITES),
    restaurarTexto: (b, email) => comoAdmin(email, () => panel.restaurarTexto(b.tramiteId), SOLO_EDITORES_TRAMITES),
    guardarSBU: (b, email) => comoAdmin(email, () => panel.guardarSBU(b, email)),
    restaurarSBU: (b, email) => comoAdmin(email, () => panel.restaurarSBU()),
    responder: (b) => panel.responder(b.id, b.texto),
    devolver: (b) => panel.devolverAlAsistente(b.id),
    cita: (b) => panel.decidirCita(b.id, b.estado, b.motivo),
    asignarCita: (b) => panel.asignarCita(b.id, b.persona),
    atenderCita: (b, email) => panel.atenderCita(b.id, email),
    devolverCita: (b, email) => panel.devolverCita(b.id, email),
    terminarCita: (b, email) => panel.terminarCita(b.id, email),
    reasignarCita: async (b, email) => { await exigir(email, ["admin", "notario"], "Solo el notario o un administrador puede reasignar una cita."); return panel.reasignarCita(b.id, b.persona); },
    revisarDocumento: (b, email) => panel.revisarDocumento(b.id, b.estado, b.nota, b.observacionCliente, email),
    borrarDocumento: (b, email) => panel.borrarDocumento(b.id, email)
  };

  return {
    async GET(request) {
      const a = await autorizar(request); if (a.no) return a.no;
      const q = new URL(request.url).searchParams, accion = q.get("accion"), l = Object.hasOwn(lecturas, accion) && lecturas[accion];
      return l ? vista.run(a.verComo, () => ejecutar(accion, accion === "buscarTicket" ? q.get("codigo") : q.get("id"), a.email, () => l.fn(q, a.email), l.auditar, l.estricta)) : json({ error: "Acción desconocida" }, 400);
    },
    async POST(request) {
      const a = await autorizar(request); if (a.no) return a.no;
      if (a.verComo) return json({ error: EN_VISTA_PREVIA }, 403);
      let b; try { b = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
      const accion = b?.accion, fn = typeof accion === "string" && Object.hasOwn(acciones, accion) && acciones[accion];
      return fn ? ejecutar(accion, (accion === "guardarFuncion" ? "funcion." + b.id : "") || b.email || b.tramiteId || b.id || b.fecha || (accion === "guardarCupo" ? "citas.porHora" : "") || (accion === "guardarSBU" || accion === "restaurarSBU" ? "sbu" : ""), a.email, () => fn(b, a.email, request), true) : json({ error: "Acción desconocida" }, 400);
    }
  };
}
