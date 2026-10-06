import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verificarFirma, extraerMensajes, crearWhatsApp } from "../api/_lib/whatsapp.js";

const firmar = (cuerpo, secreto) => "sha256=" + createHmac("sha256", secreto).update(cuerpo).digest("hex");

describe("verificarFirma", () => {
  it("acepta la firma de Meta calculada con el secreto de la app", () => {
    expect(verificarFirma('{"a":1}', firmar('{"a":1}', "s3cr3t"), "s3cr3t")).toBe(true);
  });
  it("rechaza un cuerpo alterado", () => {
    expect(verificarFirma('{"a":2}', firmar('{"a":1}', "s3cr3t"), "s3cr3t")).toBe(false);
  });
  it("rechaza si falta la cabecera", () => {
    expect(verificarFirma('{"a":1}', null, "s3cr3t")).toBe(false);
  });
});

const webhook = (mensajes, contactos = [{ wa_id: "593991112233", profile: { name: "Ana" } }]) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { contacts: contactos, messages: mensajes } }] }]
});

describe("extraerMensajes", () => {
  it("lee un mensaje de texto con el nombre del perfil", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.1", from: "593991112233", type: "text", text: { body: "Hola" } }]));
    expect(r).toEqual([{ id: "wamid.1", de: "593991112233", nombre: "Ana", tipo: "texto", texto: "Hola", timestamp: undefined }]);
  });

  it("lee un documento con su media id, nombre y leyenda", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.2", from: "593991112233", type: "document",
      document: { id: "MEDIA1", mime_type: "application/pdf", filename: "cedula.pdf", caption: "mi cédula" } }]));
    expect(r[0]).toMatchObject({ tipo: "archivo", texto: "mi cédula", media: { id: "MEDIA1", mime: "application/pdf", nombre: "cedula.pdf" } });
  });

  it("lee una foto como archivo", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.3", from: "593991112233", type: "image", image: { id: "MEDIA2", mime_type: "image/jpeg" } }]));
    expect(r[0]).toMatchObject({ tipo: "archivo", media: { id: "MEDIA2", mime: "image/jpeg" } });
  });

  it("conserva la hora del mensaje que envía Meta", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.5", from: "593991112233", timestamp: "1791300000", type: "text", text: { body: "Hola" } }]));
    expect(r[0].timestamp).toBe("1791300000");
  });

  it("ignora las reacciones (👍) para no gastar una respuesta", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.6", from: "593991112233", type: "reaction", reaction: { message_id: "x", emoji: "👍" } }]));
    expect(r).toEqual([]);
  });

  it("un botón sin título se trata como mensaje no legible, nunca como texto vacío", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.7", from: "593991112233", type: "interactive", interactive: { type: "nfm_reply" } }]));
    expect(r[0].tipo).toBe("otro");
  });

  it("ignora los avisos de estado (entregado, leído)", () => {
    const body = { entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.1", status: "read" }] } }] }] };
    expect(extraerMensajes(body)).toEqual([]);
  });

  it("marca como no soportados los tipos que no maneja (sticker, ubicación)", () => {
    const r = extraerMensajes(webhook([{ id: "wamid.4", from: "593991112233", type: "sticker", sticker: { id: "X" } }]));
    expect(r[0].tipo).toBe("otro");
  });
});

describe("crearWhatsApp", () => {
  const nuevo = (fetch) => crearWhatsApp({ token: "TKN", phoneNumberId: "PNID", version: "v23.0", fetch });

  it("envía un texto a la API de mensajes de Meta", async () => {
    const fetch = vi.fn(async () => new Response('{"messages":[{"id":"wamid.out"}]}', { status: 200 }));
    await nuevo(fetch).enviarTexto("593991112233", "Hola Ana");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/PNID/messages");
    expect(init.headers.Authorization).toBe("Bearer TKN");
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", to: "593991112233", type: "text", text: { body: "Hola Ana", preview_url: false } });
  });

  it("envía una plantilla con sus parámetros", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await nuevo(fetch).enviarPlantilla("593996530276", "aviso_personal", ["Ana pidió una cita"]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: "template", template: { name: "aviso_personal", language: { code: "es" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana pidió una cita" }] }] } });
  });

  it("limpia saltos de línea y espacios repetidos en los parámetros de plantilla (WhatsApp los rechaza)", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await nuevo(fetch).enviarPlantilla("1", "aviso_personal", ["Ana pide ayuda:\n  urgente     hoy"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).template.components[0].parameters[0].text).toBe("Ana pide ayuda: urgente hoy");
  });

  it("lanza un error con el detalle de Meta si la API falla", async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"Invalid token"}}', { status: 401 }));
    await expect(nuevo(fetch).enviarTexto("1", "x")).rejects.toThrow(/Invalid token/);
  });

  it("descarga un archivo pidiendo primero su URL temporal", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"url":"https://lookaside.fbsbx.com/m/1","mime_type":"application/pdf"}', { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const r = await nuevo(fetch).descargarArchivo("MEDIA1");
    expect(fetch.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/MEDIA1");
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer TKN");
    expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(r.mime).toBe("application/pdf");
  });
});
