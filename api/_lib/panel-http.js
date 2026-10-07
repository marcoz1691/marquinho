// API HTTP del panel del personal. Exige un token de Supabase Auth de una persona registrada en la tabla "personal",
// con el correo confirmado y, si está activada, la verificación en dos pasos (aal2).
import { Aviso } from "./errores.js";

const HORA = 3600 * 1000;
const GENERICO = "No se pudo completar la acción. Intenta de nuevo en unos segundos.";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function crearManejadorPanel({ panel, auth, exigirMfa = true, limiteDescargas = 60, ahora = () => Date.now(), avisar = async () => {} }) {
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
    if (exigirMfa && (await auth.marcarMfa(email).catch(() => false))) {
      await auth.auditar({ email, accion: "mfa_activado", objetivo: email, ok: true }).catch(() => {});
      await avisar(`Se activó la verificación en dos pasos de ${email} en el panel. Si no fue esa persona, avisa de inmediato al administrador.`).catch(() => {});
    }
    return { email };
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

  async function comoAdmin(email, fn) {
    if (!(await auth.esAdmin(email))) throw Object.assign(new Aviso("Solo un administrador puede cambiar los precios."), { status: 403 });
    return fn();
  }
  const lecturas = {
    precios: { auditar: true, fn: async (q, email) => ({ ...await panel.precios(), esAdmin: await auth.esAdmin(email) }) },
    conversaciones: { fn: () => panel.conversaciones() },
    buscarTicket: { fn: (q) => panel.buscarTicket(q.get("codigo")), auditar: true },
    agenda: { fn: (q) => panel.agenda(q.get("fecha")) },
    detalle: { fn: (q) => panel.detalle(q.get("id")), auditar: true },
    documento: { auditar: true, estricta: true, fn: async (q, email) => {
      if ((await auth.contarUso("panel:descargas:" + email, HORA, ahora())) > limiteDescargas) {
        throw Object.assign(new Aviso("Abriste muchos documentos en la última hora. Espera un momento o pide ayuda al administrador."), { status: 429 });
      }
      return { url: await panel.urlDocumento(q.get("id")) };
    } }
  };
  const acciones = {
    guardarPrecio: (b, email) => comoAdmin(email, () => panel.guardarPrecio(b, email)),
    restaurarPrecio: (b, email) => comoAdmin(email, () => panel.restaurarPrecio(b.tramiteId)),
    guardarSBU: (b, email) => comoAdmin(email, () => panel.guardarSBU(b, email)),
    responder: (b) => panel.responder(b.id, b.texto),
    devolver: (b) => panel.devolverAlAsistente(b.id),
    cita: (b) => panel.decidirCita(b.id, b.estado, b.motivo),
    asignarCita: (b) => panel.asignarCita(b.id, b.persona),
    revisarDocumento: (b) => panel.revisarDocumento(b.id, b.estado, b.nota),
    borrarDocumento: (b, email) => panel.borrarDocumento(b.id, email)
  };

  return {
    async GET(request) {
      const a = await autorizar(request); if (a.no) return a.no;
      const q = new URL(request.url).searchParams, accion = q.get("accion"), l = Object.hasOwn(lecturas, accion) && lecturas[accion];
      return l ? ejecutar(accion, accion === "buscarTicket" ? q.get("codigo") : q.get("id"), a.email, () => l.fn(q, a.email), l.auditar, l.estricta) : json({ error: "Acción desconocida" }, 400);
    },
    async POST(request) {
      const a = await autorizar(request); if (a.no) return a.no;
      let b; try { b = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
      const accion = b?.accion, fn = typeof accion === "string" && Object.hasOwn(acciones, accion) && acciones[accion];
      return fn ? ejecutar(accion, b.tramiteId || b.id || (accion === "guardarSBU" ? "sbu" : ""), a.email, () => fn(b, a.email), true) : json({ error: "Acción desconocida" }, 400);
    }
  };
}
