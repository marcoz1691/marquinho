// API HTTP del panel del personal. Exige un token de Supabase Auth de una persona registrada en la tabla "personal".
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function crearManejadorPanel({ panel, auth }) {
  async function autorizar(request) {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const usuario = token ? await auth.usuarioDeToken(token) : null;
    if (!usuario) return json({ error: "Inicia sesión" }, 401);
    if (!(await auth.esPersonal(usuario.email))) return json({ error: "Tu cuenta no está autorizada para el panel" }, 403);
    return null;
  }
  async function ejecutar(fn) {
    try { return json((await fn()) ?? { ok: true }); }
    catch (e) { return json({ error: e.message }, 400); }
  }

  const lecturas = {
    conversaciones: () => panel.conversaciones(),
    detalle: (q) => panel.detalle(q.get("id")),
    documento: async (q) => ({ url: await panel.urlDocumento(q.get("id")) }),
    agenda: (q) => panel.agenda(q.get("fecha"))
  };
  const acciones = {
    responder: (b) => panel.responder(b.id, b.texto),
    devolver: (b) => panel.devolverAlAsistente(b.id),
    cita: (b) => panel.decidirCita(b.id, b.estado, b.motivo),
    asignarCita: (b) => panel.asignarCita(b.id, b.persona),
    revisarDocumento: (b) => panel.revisarDocumento(b.id, b.estado, b.nota),
    borrarDocumento: (b) => panel.borrarDocumento(b.id)
  };

  return {
    async GET(request) {
      const no = await autorizar(request); if (no) return no;
      const q = new URL(request.url).searchParams, fn = lecturas[q.get("accion")];
      return fn ? ejecutar(() => fn(q)) : json({ error: "Acción desconocida" }, 400);
    },
    async POST(request) {
      const no = await autorizar(request); if (no) return no;
      let b; try { b = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
      const fn = acciones[b?.accion];
      return fn ? ejecutar(() => fn(b)) : json({ error: "Acción desconocida" }, 400);
    }
  };
}
