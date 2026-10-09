import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { crearManejador } from "../api/_lib/webhook.js";

const SECRETO = "app-secret", TOKEN = "verificar-123";
const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: {
  contacts: [{ wa_id: "593991112233", profile: { name: "Ana" } }],
  messages: [{ id: "wamid.1", from: "593991112233", type: "text", text: { body: "Hola" } }] } }] }] });
const firma = (b) => "sha256=" + createHmac("sha256", SECRETO).update(b).digest("hex");
const post = (b, f = firma(b)) => new Request("https://x.vercel.app/api/whatsapp", { method: "POST", body: b, headers: { "x-hub-signature-256": f } });

function preparar(atender = async () => ["¡Hola Ana!"]) {
  const tareas = [];
  const deps = {
    asistente: { atender: vi.fn(atender) },
    whatsapp: { enviarTexto: vi.fn(async () => ({})), marcarLeido: vi.fn(async () => ({})) },
    secreto: SECRETO, tokenVerificacion: TOKEN,
    enSegundoPlano: (p) => tareas.push(p)
  };
  return { m: crearManejador(deps), deps, terminar: () => Promise.all(tareas) };
}

describe("verificación del webhook (GET)", () => {
  it("devuelve el challenge cuando el token coincide", async () => {
    const { m } = preparar();
    const r = await m.GET(new Request(`https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=987`));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("987");
  });
  it("rechaza un token distinto", async () => {
    const { m } = preparar();
    const r = await m.GET(new Request("https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=987"));
    expect(r.status).toBe(403);
  });
});

describe("mensajes entrantes (POST)", () => {
  it("rechaza una firma inválida sin atender el mensaje", async () => {
    const { m, deps } = preparar();
    const r = await m.POST(post(cuerpo, "sha256=falsa"));
    expect(r.status).toBe(401);
    expect(deps.asistente.atender).not.toHaveBeenCalled();
  });

  it("responde 200 de inmediato y atiende el mensaje en segundo plano", async () => {
    const { m, deps, terminar } = preparar();
    const r = await m.POST(post(cuerpo));
    expect(r.status).toBe(200);
    await terminar();
    expect(deps.asistente.atender.mock.calls[0][0]).toMatchObject({ id: "wamid.1", texto: "Hola", nombre: "Ana" });
    expect(deps.whatsapp.marcarLeido).toHaveBeenCalledWith("wamid.1");
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("593991112233", "¡Hola Ana!");
  });

  it("envía cada respuesta como un mensaje separado y en orden", async () => {
    const { m, deps, terminar } = preparar(async () => ["Un momento", "Son $443,44"]);
    await m.POST(post(cuerpo)); await terminar();
    expect(deps.whatsapp.enviarTexto.mock.calls.map((c) => c[1])).toEqual(["Un momento", "Son $443,44"]);
  });

  it("si el asistente falla, se disculpa con el cliente", async () => {
    const { m, deps, terminar } = preparar(async () => { throw new Error("API caída"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await m.POST(post(cuerpo)); await terminar();
    expect(deps.whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/problema/i);
  });

  it("acepta webhooks de solo estados sin llamar al asistente", async () => {
    const { m, deps, terminar } = preparar();
    const b = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] });
    expect((await m.POST(post(b))).status).toBe(200);
    await terminar();
    expect(deps.asistente.atender).not.toHaveBeenCalled();
  });
});

it("envía el resumen después de las respuestas de Sofía", async () => {
  const { m, deps, terminar } = preparar(async (_, { eventos }) => {
    eventos.push({ tipo: "cita", resumen: { codigo: "4821", estado: "confirmada", fechaTexto: "jueves 8 de octubre", hora: "10:00", direccion: "Quito", requisitos: [], costo: null } });
    return ["Listo", "Tu ticket es 4821"];
  });
  await m.POST(post(cuerpo)); await terminar();
  expect(deps.whatsapp.enviarTexto.mock.calls.map((c) => c[1])).toEqual(["Listo", "Tu ticket es 4821", expect.stringContaining("Tu cita quedó confirmada. Ticket 4821")]);
});

const conCita = async (_, { eventos }) => {
  eventos.push({ tipo: "cita", resumen: { codigo: "4821", estado: "confirmada", fechaTexto: "jueves 8 de octubre", hora: "10:00", direccion: "Quito", requisitos: [], costo: null } });
  return ["Listo", "Tu ticket es 4821"];
};

it("si falla el envío de una respuesta, igual envía el resumen de la cita (el ticket no se pierde)", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { m, deps, terminar } = preparar(conCita);
  deps.whatsapp.enviarTexto.mockRejectedValueOnce(new Error("WhatsApp API 500"));
  await m.POST(post(cuerpo)); await terminar();
  expect(deps.whatsapp.enviarTexto.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([expect.stringContaining("Ticket 4821")]));
});

it("si falla el envío del resumen, no manda la disculpa genérica: la cita sí quedó creada", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { m, deps, terminar } = preparar(conCita);
  deps.whatsapp.enviarTexto.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("WhatsApp API 500"));
  await m.POST(post(cuerpo)); await terminar();
  expect(deps.whatsapp.enviarTexto.mock.calls.map((c) => c[1]).some((t) => /problema/i.test(t))).toBe(false);
});

