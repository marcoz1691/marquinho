import { describe, it, expect, vi } from "vitest";
import { crearManejadorChat } from "../api/_lib/chat-http.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const SESION = "s_7f3a9c2e41b84d0f";
const pedir = (body, ip = "190.152.10.20") => new Request("https://notaria41.vercel.app/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip + ", 10.0.0.1" }, body: typeof body === "string" ? body : JSON.stringify(body)
});

function preparar({ respuestas = ["¡Hola! ¿En qué te ayudo?"], limites } = {}) {
  const almacen = crearAlmacenMemoria();
  const asistente = { atender: vi.fn(async () => respuestas) };
  const m = crearManejadorChat({ asistente, almacen, ahora: () => 1_000_000, limites: limites || { porSesion: 3, porIp: 5, porDia: 100 } });
  return { m, asistente, almacen };
}

describe("API del chat web", () => {
  it("atiende el mensaje como canal web y devuelve las respuestas", async () => {
    const { m, asistente } = preparar();
    const r = await m.POST(pedir({ sesion: SESION, texto: "hola" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ respuestas: ["¡Hola! ¿En qué te ayudo?"] });
    expect(asistente.atender.mock.calls[0][0]).toMatchObject({ de: "web:" + SESION, canal: "web", tipo: "texto", texto: "hola" });
  });

  it("indica que hay otra respuesta en curso cuando el asistente no tomó el turno", async () => {
    const { m } = preparar({ respuestas: [] });
    expect(await (await m.POST(pedir({ sesion: SESION, texto: "hola" }))).json()).toEqual({ respuestas: [], ocupado: true });
  });

  it("rechaza una sesión inválida, un texto vacío o demasiado largo", async () => {
    const { m, asistente } = preparar();
    expect((await m.POST(pedir({ sesion: "x", texto: "hola" }))).status).toBe(400);
    expect((await m.POST(pedir({ sesion: SESION, texto: "   " }))).status).toBe(400);
    expect((await m.POST(pedir({ sesion: SESION, texto: "a".repeat(1001) }))).status).toBe(400);
    expect((await m.POST(pedir("no es json"))).status).toBe(400);
    expect(asistente.atender).not.toHaveBeenCalled();
  });

  it("limita los mensajes por sesión", async () => {
    const { m } = preparar();
    for (let i = 0; i < 3; i++) expect((await m.POST(pedir({ sesion: SESION, texto: "hola" }))).status).toBe(200);
    const r = await m.POST(pedir({ sesion: SESION, texto: "hola" }));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/WhatsApp/);
  });

  it("limita los mensajes por dirección IP aunque cambie la sesión", async () => {
    const { m } = preparar();
    for (let i = 0; i < 5; i++) await m.POST(pedir({ sesion: SESION + i, texto: "hola" }));
    expect((await m.POST(pedir({ sesion: SESION + "x", texto: "hola" }))).status).toBe(429);
  });

  it("tiene un tope diario global para acotar el costo", async () => {
    const { m } = preparar({ limites: { porSesion: 100, porIp: 100, porDia: 2 } });
    await m.POST(pedir({ sesion: SESION, texto: "hola" }, "1.1.1.1"));
    await m.POST(pedir({ sesion: SESION + "b", texto: "hola" }, "2.2.2.2"));
    expect((await m.POST(pedir({ sesion: SESION + "c", texto: "hola" }, "3.3.3.3"))).status).toBe(429);
  });

  it("no guarda la IP en claro", async () => {
    const { m, almacen } = preparar();
    const espia = vi.spyOn(almacen, "contarUso");
    await m.POST(pedir({ sesion: SESION, texto: "hola" }));
    expect(JSON.stringify(espia.mock.calls)).not.toContain("190.152.10.20");
  });
});
