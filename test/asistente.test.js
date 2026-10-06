import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearAsistente } from "../api/_lib/asistente.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const contenido = {
  data: {
    categorias: [{ id: "inmuebles", nombre: "Escrituras e inmuebles", resumen: "" }],
    tramites: [
      { id: "compraventa", cat: "inmuebles", nombre: "Compraventa de inmuebles", desc: "Transferir una casa", req: ["Minuta"], pasos: ["Firma"],
        tarifa: { tipo: "cuantia", tabla: "transferencia" } }
    ],
    faq: [], avisos: []
  },
  tarifas: { sbu: 482, iva: 0.15, anio: 2026, tablas: { transferencia: [[60000, 0.5], [90000, 0.8], [null, 20]] } },
  notaria: { nombre: "Notaría 41 de Quito", notario: "Dr. X", direccion: "Tumbaco", telefonos: ["02 600 1141"], correo: "n@x.ec",
    horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "Lunes a viernes, 08:00 – 17:00" }, mapa: { lat: 0, lng: 0 }, redes: {} }
};

// Respuestas guionizadas del modelo: cada llamada consume la siguiente.
function claudeFalso(guion) {
  const llamadas = [];
  const create = vi.fn(async (params) => {
    llamadas.push(JSON.parse(JSON.stringify(params)));
    const r = guion.shift();
    if (!r) throw new Error("guion agotado");
    return r;
  });
  return { beta: { messages: { create } }, llamadas };
}
const texto = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const herramienta = (name, input, id = "tu_1") => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const mensaje = (over = {}) => ({ id: "wamid." + Math.random(), de: "593991112233", nombre: "Ana", tipo: "texto", texto: "Hola", ...over });

let almacen, avisar, whatsapp;
beforeEach(() => {
  almacen = crearAlmacenMemoria();
  avisar = vi.fn(async () => {});
  whatsapp = { descargarArchivo: vi.fn(async () => ({ bytes: new Uint8Array([7]), mime: "application/pdf" })) };
});
const nuevo = (claude, ahora = () => new Date("2026-10-06T15:00:00Z"), extra = {}) =>
  crearAsistente({ claude, almacen, whatsapp, contenido: async () => contenido, avisar, ahora, esperar: async () => {}, ...extra });

describe("atender", () => {
  it("responde en lenguaje natural con el texto del modelo", async () => {
    const claude = claudeFalso([texto("¡Hola Ana! ¿En qué te ayudo?")]);
    expect(await nuevo(claude).atender(mensaje())).toEqual(["¡Hola Ana! ¿En qué te ayudo?"]);
  });

  it("llama al modelo con caché del prompt, respaldo por rechazo y la base de conocimiento", async () => {
    const claude = claudeFalso([texto("ok")]);
    await nuevo(claude).atender(mensaje());
    const p = claude.llamadas[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toContain("server-side-fallback-2026-07-01");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.system[0].text).toContain("Compraventa de inmuebles");
  });

  it("pone la fecha y el estado como mensaje de sistema después del mensaje del cliente", async () => {
    const claude = claudeFalso([texto("ok")]);
    await nuevo(claude).atender(mensaje());
    const m = claude.llamadas[0].messages;
    expect(m.at(-2)).toEqual({ role: "user", content: "Hola" });
    expect(m.at(-1).role).toBe("system");
    expect(m.at(-1).content).toMatch(/2026/);
  });

  it("recuerda la conversación en el siguiente mensaje", async () => {
    const claude = claudeFalso([texto("Hola"), texto("Claro")]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "Hola" }));
    await a.atender(mensaje({ texto: "¿Y el costo?" }));
    const m = claude.llamadas[1].messages;
    expect(m.map((x) => x.role)).toEqual(["user", "system", "assistant", "user", "system"]);
  });

  it("empieza una sesión nueva después de 24 horas sin mensajes", async () => {
    const claude = claudeFalso([texto("Hola"), texto("Hola de nuevo")]);
    let t = new Date("2026-10-06T15:00:00Z");
    const a = nuevo(claude, () => t);
    await a.atender(mensaje());
    t = new Date("2026-10-07T16:00:00Z");
    await a.atender(mensaje());
    expect(claude.llamadas[1].messages.map((x) => x.role)).toEqual(["user", "system"]);
  });

  it("no procesa dos veces el mismo mensaje de WhatsApp", async () => {
    const claude = claudeFalso([texto("Hola")]);
    const a = nuevo(claude), m = mensaje();
    await a.atender(m);
    expect(await a.atender(m)).toEqual([]);
    expect(claude.llamadas).toHaveLength(1);
  });

  it("no responde mientras la conversación está derivada a una persona", async () => {
    const claude = claudeFalso([]);
    const conv = await almacen.conversacion("593991112233", "Ana");
    await almacen.actualizarConversacion(conv.id, { derivada: true });
    expect(await nuevo(claude).atender(mensaje())).toEqual([]);
    expect(claude.llamadas).toHaveLength(0);
  });

  it("guarda el mensaje del cliente aunque esté derivada, para que el personal lo vea", async () => {
    const conv = await almacen.conversacion("593991112233", "Ana");
    await almacen.actualizarConversacion(conv.id, { derivada: true });
    await nuevo(claudeFalso([])).atender(mensaje({ texto: "¿Hay alguien?" }));
    expect(JSON.stringify(await almacen.historial(conv.id))).toContain("¿Hay alguien?");
  });
});

describe("herramientas", () => {
  const resultadoDe = (claude, n = 1) => claude.llamadas[n].messages.at(-1).content[0];

  it("calcular_costo usa la tabla de cuantía", async () => {
    const claude = claudeFalso([herramienta("calcular_costo", { tramite_id: "compraventa", monto: 85000 }), texto("Son $443,44")]);
    await nuevo(claude).atender(mensaje({ texto: "cuánto cuesta vender mi casa de 85 mil" }));
    const r = resultadoDe(claude);
    expect(r.type).toBe("tool_result");
    expect(r.content).toContain("$443,44");
  });

  it("calcular_costo con un trámite inexistente devuelve error", async () => {
    const claude = claudeFalso([herramienta("calcular_costo", { tramite_id: "nada" }), texto("No lo encuentro")]);
    await nuevo(claude).atender(mensaje());
    expect(resultadoDe(claude).is_error).toBe(true);
  });

  it("solicitar_cita registra la solicitud pendiente y avisa al personal", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana Pérez" }), texto("Listo")]);
    await nuevo(claude).atender(mensaje());
    const conv = await almacen.conversacion("593991112233");
    const [cita] = await almacen.solicitudesCita(conv.id);
    expect(cita).toMatchObject({ tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", estado: "pendiente" });
    expect(avisar.mock.calls[0][0]).toMatch(/Ana Pérez.*Compraventa/);
    expect(resultadoDe(claude).content).toMatch(/pendiente/i);
  });

  it("guardar_documento exige el consentimiento de datos", async () => {
    const claude = claudeFalso([herramienta("guardar_documento", { media_id: "M1", descripcion: "cédula" }), texto("Necesito tu consentimiento")]);
    await nuevo(claude).atender(mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime: "application/pdf", nombre: "c.pdf" } }));
    expect(resultadoDe(claude).is_error).toBe(true);
    expect(resultadoDe(claude).content).toMatch(/consentimiento/i);
    expect(whatsapp.descargarArchivo).not.toHaveBeenCalled();
  });

  it("guardar_documento descarga y guarda un archivo recibido después del consentimiento", async () => {
    const claude = claudeFalso([
      herramienta("registrar_consentimiento", {}), texto("Gracias"),
      herramienta("guardar_documento", { media_id: "M1", descripcion: "cédula", tramite_id: "compraventa" }, "tu_2"), texto("Recibido")
    ]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "sí acepto" }));
    await a.atender(mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime: "application/pdf", nombre: "c.pdf" } }));
    const conv = await almacen.conversacion("593991112233");
    const [doc] = await almacen.documentos(conv.id);
    expect(doc).toMatchObject({ mediaId: "M1", descripcion: "cédula", tramiteId: "compraventa" });
    expect([...doc.bytes]).toEqual([7]);
    expect(avisar).toHaveBeenCalled();
  });

  it("guardar_documento rechaza archivos de más de 15 MB", async () => {
    whatsapp.descargarArchivo = vi.fn(async () => ({ bytes: new Uint8Array(16 * 1024 * 1024), mime: "application/pdf" }));
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("ok"),
      herramienta("guardar_documento", { media_id: "M1", descripcion: "escritura" }, "tu_2"), texto("muy grande")]);
    const a = nuevo(claude);
    await a.atender(mensaje());
    await a.atender(mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime: "application/pdf" } }));
    expect(claude.llamadas[3].messages.at(-1).content[0]).toMatchObject({ is_error: true });
    expect(await almacen.documentos((await almacen.conversacion("593991112233")).id)).toEqual([]);
  });

  it("guardar_documento rechaza un archivo que el cliente no envió", async () => {
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("ok"), herramienta("guardar_documento", { media_id: "INVENTADO", descripcion: "x" }, "tu_2"), texto("no")]);
    const a = nuevo(claude);
    await a.atender(mensaje());
    await a.atender(mensaje());
    expect(claude.llamadas[3].messages.at(-1).content[0].is_error).toBe(true);
    expect(whatsapp.descargarArchivo).not.toHaveBeenCalled();
  });

  it("el archivo recibido llega al modelo como texto con su identificador", async () => {
    const claude = claudeFalso([texto("Recibí tu archivo")]);
    await nuevo(claude).atender(mensaje({ tipo: "archivo", texto: "mi cédula", media: { id: "M9", mime: "image/jpeg" } }));
    const m = claude.llamadas[0].messages.at(-2).content;
    expect(m).toMatch(/M9/);
    expect(m).toMatch(/mi cédula/);
  });

  it("derivar_a_persona pausa al asistente y avisa al personal", async () => {
    const claude = claudeFalso([herramienta("derivar_a_persona", { motivo: "quiere hablar con el notario" }), texto("Te comunico con una persona")]);
    expect(await nuevo(claude).atender(mensaje())).toEqual(["Te comunico con una persona"]);
    const conv = await almacen.conversacion("593991112233");
    expect(conv.derivada).toBe(true);
    expect(avisar.mock.calls[0][0]).toMatch(/hablar con el notario/);
  });

  it("estado_de_mi_tramite incluye la revisión del personal sobre cada documento", async () => {
    const conv = await almacen.conversacion("593991112233", "Ana");
    const { id } = await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "M1", nombre: "", mime: "", bytes: new Uint8Array([1]), descripcion: "cédula" });
    await almacen.revisarDocumento(id, { estado: "observado", nota: "está borrosa" });
    const claude = claudeFalso([herramienta("estado_de_mi_tramite", {}), texto("Tu cédula está observada")]);
    await nuevo(claude).atender(mensaje());
    expect(resultadoDe(claude).content).toMatch(/cédula.*observado.*borrosa/);
  });

  it("estado_de_mi_tramite lista las solicitudes y documentos del cliente", async () => {
    const conv = await almacen.conversacion("593991112233", "Ana");
    await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    const claude = claudeFalso([herramienta("estado_de_mi_tramite", {}), texto("Tu cita está pendiente")]);
    await nuevo(claude).atender(mensaje());
    expect(resultadoDe(claude).content).toMatch(/2026-10-08.*pendiente/);
  });
});

describe("mensajes seguidos y fallas", () => {
  it("dos burbujas seguidas en webhooks distintos se atienden en un solo turno, sin respuestas duplicadas", async () => {
    let soltar;
    const pausa = new Promise((r) => { soltar = r; });
    const claude = claudeFalso([texto("Un poder especial cuesta $57,84 + IVA")]);
    // El primer webhook espera para agrupar; mientras tanto llega la segunda burbuja.
    const a = nuevo(claude, undefined, { esperar: () => pausa });
    const p1 = a.atender(mensaje({ id: "w1", texto: "Hola" }));
    await new Promise((r) => setTimeout(r, 5));
    const p2 = a.atender(mensaje({ id: "w2", texto: "¿cuánto cuesta un poder?" }));
    await new Promise((r) => setTimeout(r, 5));
    soltar();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(claude.llamadas).toHaveLength(1);
    expect(claude.llamadas[0].messages[0]).toEqual({ role: "user", content: "Hola\n¿cuánto cuesta un poder?" });
    expect([...r1, ...r2]).toEqual(["Un poder especial cuesta $57,84 + IVA"]);
  });

  it("si llega un mensaje mientras responde, lo atiende en un turno siguiente", async () => {
    let a;
    const claude = claudeFalso([texto("Hola"), texto("Claro")]);
    const original = claude.beta.messages.create;
    claude.beta.messages.create = vi.fn(async (p) => {
      if (claude.llamadas.length === 0) setTimeout(() => a.atender(mensaje({ id: "w2", texto: "Otra cosa" })), 0);
      const r = await original(p);
      await new Promise((res) => setTimeout(res, 10));
      return r;
    });
    a = nuevo(claude);
    const r1 = await a.atender(mensaje({ id: "w1", texto: "Hola" }));
    expect(claude.llamadas).toHaveLength(2);
    expect(r1).toEqual(["Hola", "Claro"]);
    expect(claude.llamadas[1].messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "system"]);
  });

  it("si Claude falla, se disculpa y deja el historial válido para el siguiente mensaje", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const claude = claudeFalso([]);
    claude.beta.messages.create.mockRejectedValueOnce(Object.assign(new Error("overloaded"), { status: 529 }));
    const a = nuevo(claude);
    const r = await a.atender(mensaje({ texto: "Hola" }));
    expect(r[0]).toMatch(/problema/i);
    const conv = await almacen.conversacion("593991112233");
    expect((await almacen.historial(conv.id)).map((m) => m.role)).toEqual(["user", "system", "assistant"]);
  });

  it("registra la hora del mensaje del cliente aunque Claude falle (ventana de 24 h)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const claude = claudeFalso([]);
    claude.beta.messages.create.mockRejectedValueOnce(new Error("caído"));
    await nuevo(claude).atender(mensaje({ timestamp: "1791300000" }));
    const conv = await almacen.conversacion("593991112233");
    expect(await almacen.ultimoMensajeCliente(conv.id)).toBe(1791300000000);
  });

  it("si el modelo termina sin escribir nada, igual responde algo al cliente", async () => {
    const claude = claudeFalso([{ stop_reason: "end_turn", content: [] }]);
    const r = await nuevo(claude).atender(mensaje());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/persona/);
  });

  it("guarda el historial vuelta a vuelta", async () => {
    const claude = claudeFalso([herramienta("estado_de_mi_tramite", {}), texto("No tienes citas")]);
    const espia = vi.spyOn(almacen, "agregarMensajes");
    await nuevo(claude).atender(mensaje());
    expect(espia.mock.calls.map((c) => c[1].map((m) => m.role))).toEqual([["user", "system", "assistant", "user"], ["assistant"]]);
  });
});

describe("horario escrito de distintas formas en la hoja", () => {
  it("acepta una cita a las 09:00 cuando la hoja dice que abre a las 8:00", async () => {
    const otro = structuredClone(contenido);
    otro.notaria.horario.abre = "8:00"; otro.notaria.horario.cierra = "17:00:00";
    const claude = claudeFalso([herramienta("solicitar_cita", { fecha: "2026-10-08", hora: "9:00", nombre: "Ana" }), texto("ok")]);
    await crearAsistente({ claude, almacen, whatsapp, contenido: async () => otro, avisar, ahora: () => new Date("2026-10-06T15:00:00Z"), esperar: async () => {} }).atender(mensaje());
    expect(claude.llamadas[1].messages.at(-1).content[0].is_error).toBeUndefined();
  });

  it("rechaza una cita para hoy a una hora que ya pasó", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { fecha: "2026-10-06", hora: "09:00", nombre: "Ana" }), texto("ok")]);
    await nuevo(claude).atender(mensaje()); // 15:00 UTC = 10:00 en Quito
    expect(claude.llamadas[1].messages.at(-1).content[0].is_error).toBe(true);
  });
});
