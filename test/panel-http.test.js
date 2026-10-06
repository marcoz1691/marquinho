import { describe, it, expect, vi } from "vitest";
import { crearManejadorPanel } from "../api/_lib/panel-http.js";

function preparar({ usuario = { email: "carla@notaria41.ec" }, esPersonal = true } = {}) {
  const panel = {
    conversaciones: vi.fn(async () => [{ id: "1" }]),
    detalle: vi.fn(async (id) => ({ id })),
    responder: vi.fn(async () => {}),
    devolverAlAsistente: vi.fn(async () => {}),
    decidirCita: vi.fn(async () => ({ avisado: true })),
    urlDocumento: vi.fn(async () => "https://firmada"),
    borrarDocumento: vi.fn(async () => {})
  };
  const auth = { usuarioDeToken: vi.fn(async (t) => (t === "TOKEN" ? usuario : null)), esPersonal: vi.fn(async () => esPersonal) };
  return { m: crearManejadorPanel({ panel, auth }), panel };
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

  it("devuelve el error del panel como 400 con su mensaje", async () => {
    const { m, panel } = preparar();
    panel.responder.mockRejectedValueOnce(new Error("Pasaron más de 24 horas"));
    const r = await m.POST(req("POST", "", { body: { accion: "responder", id: "1", texto: "Hola" } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/24 horas/);
  });

  it("rechaza acciones desconocidas", async () => {
    const { m } = preparar();
    expect((await m.POST(req("POST", "", { body: { accion: "borrarTodo" } }))).status).toBe(400);
  });
});
