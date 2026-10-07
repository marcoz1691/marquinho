import { describe, it, expect, vi } from "vitest";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";
import { Aviso } from "../api/_lib/errores.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const CONFIRMADO = "2026-10-01T00:00:00Z";
function preparar({ usuario = { email: "carla@notaria41.ec", email_confirmed_at: CONFIRMADO, aal: "aal2" }, esPersonal = true, exigirMfa = true, limiteDescargas, avisar } = {}) {
  const panel = {
    buscarTicket: vi.fn(async () => []),
    conversaciones: vi.fn(async () => [{ id: "1" }]),
    detalle: vi.fn(async (id) => ({ id })),
    responder: vi.fn(async () => {}),
    devolverAlAsistente: vi.fn(async () => {}),
    decidirCita: vi.fn(async () => ({ avisado: true })),
    urlDocumento: vi.fn(async () => "https://firmada"),
    borrarDocumento: vi.fn(async () => {})
  };
  const almacen = crearAlmacenMemoria();
  const auth = Object.assign(almacen, { usuarioDeToken: vi.fn(async (t) => (t === "TOKEN" ? usuario : null)), esPersonal: vi.fn(async () => esPersonal) });
  return { m: crearManejadorPanel({ panel, auth, exigirMfa, limiteDescargas, avisar, ahora: () => 1_000_000 }), panel, almacen };
}
const req = (metodo, ruta, { token = "TOKEN", body } = {}) => new Request("https://x/api/panel" + ruta, {
  method: metodo, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" }, body: body && JSON.stringify(body)
});

describe("API del panel", () => {
  it("rechaza sin sesión", async () => {
    const { m, panel } = preparar();
    expect((await m.GET(req("GET", "?accion=conversaciones", { token: null }))).status).toBe(401);
    expect(panel.conversaciones).not.toHaveBeenCalled();
  });

  it("rechaza a una cuenta que no es del personal", async () => {
    const { m } = preparar({ esPersonal: false });
    expect((await m.GET(req("GET", "?accion=conversaciones"))).status).toBe(403);
  });

  it("lista las conversaciones", async () => {
    const { m } = preparar();
    const r = await m.GET(req("GET", "?accion=conversaciones"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ id: "1" }]);
  });

  it("responde a un cliente", async () => {
    const { m, panel } = preparar();
    const r = await m.POST(req("POST", "", { body: { accion: "responder", id: "1", texto: "Hola" } }));
    expect(r.status).toBe(200);
    expect(panel.responder).toHaveBeenCalledWith("1", "Hola");
  });

  it("devuelve los avisos del panel como 400 con su mensaje", async () => {
    const { m, panel } = preparar();
    panel.responder.mockRejectedValueOnce(new Aviso("Pasaron más de 24 horas"));
    const r = await m.POST(req("POST", "", { body: { accion: "responder", id: "1", texto: "Hola" } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/24 horas/);
  });

  it("no expone el detalle de un error interno (base de datos, red)", async () => {
    const { m, panel } = preparar();
    vi.spyOn(console, "error").mockImplementation(() => {});
    panel.responder.mockRejectedValueOnce(new Error("Supabase: relation \"documentos\" column ruta /abc/cedula.pdf"));
    const r = await m.POST(req("POST", "", { body: { accion: "responder", id: "1", texto: "Hola" } }));
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).not.toMatch(/Supabase|ruta|cedula/);
    expect(error).toMatch(/intenta de nuevo/i);
  });

  it("exige la verificación en dos pasos (aal2) cuando está activada", async () => {
    const { m, panel } = preparar({ usuario: { email: "carla@notaria41.ec", email_confirmed_at: CONFIRMADO, aal: "aal1" } });
    const r = await m.GET(req("GET", "?accion=conversaciones"));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ mfa: true });
    expect(panel.conversaciones).not.toHaveBeenCalled();
  });

  it("permite aal1 solo si la verificación en dos pasos está desactivada", async () => {
    const { m } = preparar({ usuario: { email: "carla@notaria41.ec", email_confirmed_at: CONFIRMADO, aal: "aal1" }, exigirMfa: false });
    expect((await m.GET(req("GET", "?accion=conversaciones"))).status).toBe(200);
  });

  it("rechaza una cuenta con el correo sin confirmar", async () => {
    const { m } = preparar({ usuario: { email: "carla@notaria41.ec", email_confirmed_at: null, aal: "aal2" } });
    expect((await m.GET(req("GET", "?accion=conversaciones"))).status).toBe(403);
  });

  it("registra en la auditoría quién vio un documento, abrió una conversación o hizo una acción", async () => {
    const { m, almacen } = preparar();
    await m.GET(req("GET", "?accion=documento&id=d1"));
    await m.GET(req("GET", "?accion=detalle&id=c1"));
    await m.POST(req("POST", "", { body: { accion: "borrarDocumento", id: "d1" } }));
    await m.GET(req("GET", "?accion=conversaciones"));   // las listas no se registran (se refrescan cada 15 s)
    expect((await almacen.auditoria()).filter((a) => a.accion !== "mfa_activado").map((a) => [a.email, a.accion, a.objetivo, a.ok])).toEqual([
      ["carla@notaria41.ec", "documento", "d1", true],
      ["carla@notaria41.ec", "detalle", "c1", true],
      ["carla@notaria41.ec", "borrarDocumento", "d1", true]
    ]);
  });

  it("registra también las acciones que fallan", async () => {
    const { m, panel, almacen } = preparar();
    panel.responder.mockRejectedValueOnce(new Aviso("Pasaron más de 24 horas"));
    await m.POST(req("POST", "", { body: { accion: "responder", id: "c9", texto: "Hola" } }));
    expect((await almacen.auditoria()).find((a) => a.accion === "responder")).toMatchObject({ objetivo: "c9", ok: false });
  });

  it("limita cuántos documentos puede abrir una persona por hora", async () => {
    const { m, panel } = preparar({ limiteDescargas: 2 });
    for (let i = 0; i < 2; i++) expect((await m.GET(req("GET", "?accion=documento&id=d" + i))).status).toBe(200);
    const r = await m.GET(req("GET", "?accion=documento&id=d9"));
    expect(r.status).toBe(429);
    expect(panel.urlDocumento).toHaveBeenCalledTimes(2);
  });

  it("rechaza acciones desconocidas", async () => {
    const { m } = preparar();
    expect((await m.POST(req("POST", "", { body: { accion: "borrarTodo" } }))).status).toBe(400);
  });

  it("si la auditoría falla, no entrega el documento (falla cerrado)", async () => {
    const { m, panel, almacen } = preparar();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(almacen, "auditar").mockRejectedValue(new Error("base caída"));
    const r = await m.GET(req("GET", "?accion=documento&id=d1"));
    expect(r.status).toBe(500);
    expect(panel.urlDocumento).not.toHaveBeenCalled();
  });

  it("limita el largo del objetivo que queda en la auditoría", async () => {
    const { m, almacen } = preparar();
    await m.GET(req("GET", "?accion=detalle&id=" + "x".repeat(500)));
    expect((await almacen.auditoria()).find((a) => a.accion === "detalle").objetivo.length).toBeLessThanOrEqual(80);
  });

  it("la primera vez que alguien entra con la verificación en dos pasos queda registrado y se avisa al administrador", async () => {
    const avisar = vi.fn(async () => {});
    const { m, almacen } = preparar({ avisar });
    await m.GET(req("GET", "?accion=conversaciones"));
    await m.GET(req("GET", "?accion=conversaciones"));
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar.mock.calls[0][0]).toMatch(/verificación en dos pasos de carla@notaria41\.ec/);
    expect((await almacen.auditoria()).filter((a) => a.accion === "mfa_activado")).toHaveLength(1);
  });
});

it("audita la lectura y rechaza cambios de precios sin rol admin", async () => {
  const { m, panel, almacen } = preparar();
  panel.precios = vi.fn(async () => ({ tramites: [] }));
  panel.guardarPrecio = vi.fn();
  expect((await m.GET(req("GET", "?accion=precios"))).status).toBe(200);
  for (const accion of ["guardarPrecio", "restaurarPrecio", "guardarSBU"]) {
    const r = await m.POST(req("POST", "", { body: { accion, tramiteId: "t" } }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Solo un administrador puede cambiar los precios.");
  }
  expect(panel.guardarPrecio).not.toHaveBeenCalled();
  expect((await almacen.auditoria()).filter((x) => x.accion !== "mfa_activado").map((x) => [x.accion, x.ok])).toEqual([["precios", true], ["guardarPrecio", false], ["restaurarPrecio", false], ["guardarSBU", false]]);
});

it("permite cambios al administrador y los audita", async () => {
  const { m, panel, almacen } = preparar();
  almacen.esAdmin = async () => true;
  panel.guardarPrecio = vi.fn(async () => {});
  panel.restaurarPrecio = vi.fn(async () => {});
  panel.guardarSBU = vi.fn(async () => {});
  for (const accion of ["guardarPrecio", "restaurarPrecio", "guardarSBU"]) {
    expect((await m.POST(req("POST", "", { body: { accion, tramiteId: "t", sbu: 500 } }))).status).toBe(200);
  }
  expect(panel.guardarPrecio).toHaveBeenCalledWith(expect.objectContaining({ tramiteId: "t" }), "carla@notaria41.ec");
  expect((await almacen.auditoria()).every((x) => x.ok)).toBe(true);
});

it("audita buscarTicket con el código como objetivo", async () => {
  const { m, panel, almacen } = preparar();
  const r = await m.GET(req("GET", "?accion=buscarTicket&codigo=4821"));
  expect(r.status).toBe(200);
  expect(panel.buscarTicket).toHaveBeenCalledWith("4821");
  expect(await almacen.auditoria()).toContainEqual(expect.objectContaining({ accion: "buscarTicket", objetivo: "4821", ok: true }));
});

it("audita también una búsqueda de ticket fallida", async () => {
  const { m, panel, almacen } = preparar();
  panel.buscarTicket.mockRejectedValueOnce(new Aviso("Escribe un ticket válido de 4 dígitos."));
  expect((await m.GET(req("GET", "?accion=buscarTicket&codigo=x"))).status).toBe(400);
  expect(await almacen.auditoria()).toContainEqual(expect.objectContaining({ accion: "buscarTicket", objetivo: "x", ok: false }));
});
