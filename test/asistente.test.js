import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearAsistente } from "../api/_lib/asistente.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

const contenido = {
  data: {
    categorias: [{ id: "inmuebles", nombre: "Escrituras e inmuebles", resumen: "" }],
    tramites: [
      { id: "compraventa", cat: "inmuebles", nombre: "Compraventa de inmuebles", desc: "Transferir una casa", req: ["Minuta"], pasos: ["Firma"],
        tarifa: { tipo: "cuantia", tabla: "transferencia" }, revision: true },
      { id: "poder", cat: "inmuebles", nombre: "Poder especial", desc: "Que alguien firme por ti", req: ["Cédula"], pasos: ["Firma"],
        tarifa: { tipo: "pct", valor: 0.12 } },
      { id: "copias-certificadas", cat: "inmuebles", nombre: "Copias certificadas", desc: "", req: [], pasos: [], tarifa: { tipo: "fija", valor: 1.79, unidad: "por hoja" } },
      { id: "certificacion-electronica", cat: "inmuebles", nombre: "Certificación de documentos electrónicos", desc: "", req: [], pasos: [], tarifa: { tipo: "fija", valor: 1.34, unidad: "por hoja" } }
    ],
    faq: [], avisos: []
  },
  tarifas: { sbu: 482, iva: 0.15, anio: 2026, tablas: { transferencia: [[60000, 0.5], [90000, 0.8], [null, 20]] } },
  notaria: { nombre: "Notaría 41 de Quito", notario: "Dr. X", direccion: "Tumbaco", telefonos: ["02 600 1141"], correo: "n@x.ec",
    horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "Lunes a viernes, 08:00 – 17:00" }, mapa: { lat: 0, lng: 0 }, redes: {},
    citas: { porHora: 2, feriados: ["2026-10-09"] } }
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

// Cabeceras reales ("números mágicos") de cada tipo de archivo.
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46];
const EXE = [0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0];

let almacen, avisar, whatsapp;
beforeEach(() => {
  almacen = crearAlmacenMemoria();
  avisar = vi.fn(async () => {});
  whatsapp = { descargarArchivo: vi.fn(async () => ({ bytes: new Uint8Array(PDF), mime: "application/pdf" })) };
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

  it("calcular_costo aclara que no incluye documentos habilitantes", async () => {
    const claude = claudeFalso([herramienta("calcular_costo", { tramite_id: "poder" }), texto("Son $66,52")]);
    await nuevo(claude).atender(mensaje({ texto: "cuánto cuesta un poder" }));
    expect(resultadoDe(claude).content).toContain("no incluye documentos habilitantes");
  });

  it("el prompt explica que los costos no incluyen habilitantes y su precio por hoja", async () => {
    const claude = claudeFalso([texto("ok")]);
    await nuevo(claude).atender(mensaje());
    const s = claude.llamadas[0].system[0].text;
    expect(s).toContain("documentos habilitantes");
    expect(s).toMatch(/copias certificadas \$1,79 \+ IVA/);
    expect(s).toMatch(/materializaciones \$1,34 \+ IVA/);
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

  describe("citas que se confirman solas", () => {
    const pedir = (datos) => claudeFalso([herramienta("solicitar_cita", { nombre: "Ana Pérez", ...datos }), texto("Listo")]);
    const citas = async () => almacen.solicitudesCita((await almacen.conversacion("593991112233")).id);

    it("confirma al instante un trámite simple si hay cupo, sin pedir nada al personal", async () => {
      const claude = pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" });
      await nuevo(claude).atender(mensaje());
      expect((await citas())[0]).toMatchObject({ tramiteId: "poder", estado: "confirmada" });
      expect(resultadoDe(claude).content).toMatch(/confirmada/i);
      expect(avisar).not.toHaveBeenCalled();
    });

    it("deja pendiente una cita sin trámite definido", async () => {
      await nuevo(pedir({ fecha: "2026-10-08", hora: "10:00" })).atender(mensaje());
      expect((await citas())[0].estado).toBe("pendiente");
      expect(avisar).toHaveBeenCalled();
    });

    it("con la hora llena no agenda y ofrece las horas libres de ese día", async () => {
      const otra = await almacen.conversacion("593990000001", "Luis");
      await almacen.crearSolicitudCita({ conversacionId: otra.id, tramiteId: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Luis", estado: "confirmada" });
      await almacen.crearSolicitudCita({ conversacionId: otra.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:30", nombre: "Luis" });
      const claude = pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:30" });
      await nuevo(claude).atender(mensaje());
      expect(await citas()).toHaveLength(0);
      const r = resultadoDe(claude);
      expect(r.is_error).toBe(true);
      expect(r.content).toMatch(/09:00/);
      expect(r.content).not.toMatch(/10:00/);
    });

    it("las citas rechazadas no ocupan cupo", async () => {
      const otra = await almacen.conversacion("593990000001", "Luis");
      for (const hora of ["10:00", "10:30"]) {
        const { id } = await almacen.crearSolicitudCita({ conversacionId: otra.id, tramiteId: "poder", fecha: "2026-10-08", hora, nombre: "Luis" });
        await almacen.actualizarCita(id, { estado: "rechazada" });
      }
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" })).atender(mensaje());
      expect((await citas())[0].estado).toBe("confirmada");
    });

    it("no agenda en un feriado", async () => {
      const claude = pedir({ tramite_id: "poder", fecha: "2026-10-09", hora: "10:00" });
      await nuevo(claude).atender(mensaje());
      expect(resultadoDe(claude).is_error).toBe(true);
      expect(await citas()).toHaveLength(0);
    });

    it("si ya tiene una cita activa, no crea otra: pide confirmar el cambio", async () => {
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" })).atender(mensaje());
      const claude = pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "15:00" });
      await nuevo(claude).atender(mensaje());
      expect(await citas()).toHaveLength(1);
      expect(resultadoDe(claude).is_error).toBe(true);
      expect(resultadoDe(claude).content).toMatch(/reprogramar/);
    });

    it("una cita de hoy cuya hora ya pasó no cuenta como activa", async () => {
      const conv = await almacen.conversacion("593991112233", "Ana");
      await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "poder", fecha: "2026-10-06", hora: "09:00", nombre: "Ana", estado: "confirmada" });
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" })).atender(mensaje()); // ahora: 10:00 en Quito
      const [antigua, nueva] = await citas();
      expect(antigua.estado).toBe("confirmada");
      expect(nueva.estado).toBe("confirmada");
    });

    it("al reprogramar cancela la cita anterior y libera su cupo", async () => {
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" })).atender(mensaje());
      const codigoAnterior = (await citas())[0].codigo;
      const otra = await almacen.conversacion("593990000001", "Luis");
      await almacen.crearSolicitudCita({ conversacionId: otra.id, tramiteId: "poder", fecha: "2026-10-08", hora: "10:30", nombre: "Luis", estado: "confirmada" });
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:30", reprogramar: true })).atender(mensaje());
      const [vieja, nueva] = await citas();
      expect(vieja).toMatchObject({ hora: "10:00", estado: "rechazada", motivo: "Reprogramada por el cliente", codigo: codigoAnterior });
      expect(nueva.codigo).not.toBe(codigoAnterior);
      expect(nueva).toMatchObject({ hora: "10:30", estado: "confirmada" });
    });

    it("solo promete el recordatorio si el cron de la tarde anterior todavía lo va a enviar", async () => {
      const lejos = pedir({ tramite_id: "poder", fecha: "2026-10-08", hora: "10:00" });
      await nuevo(lejos).atender(mensaje());
      expect(resultadoDe(lejos).content).toMatch(/recordatorio/);
      const hoy = pedir({ tramite_id: "poder", fecha: "2026-10-06", hora: "15:00", reprogramar: true });
      await nuevo(hoy).atender(mensaje());
      expect(resultadoDe(hoy).content).not.toMatch(/recordatorio/);
    });

    it("avisa al personal si la cita confirmada es para hoy, porque ya pasó el resumen de la mañana", async () => {
      await nuevo(pedir({ tramite_id: "poder", fecha: "2026-10-06", hora: "14:00" })).atender(mensaje()); // ahora: 10:00 en Quito
      expect((await citas())[0].estado).toBe("confirmada");
      expect(avisar.mock.calls[0][0]).toMatch(/hoy.*14:00/i);
    });
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
    expect([...doc.bytes]).toEqual(PDF);
    expect(avisar).toHaveBeenCalled();
  });

  it("guardar_documento rechaza archivos de más de 15 MB", async () => {
    whatsapp.descargarArchivo = vi.fn(async () => ({ bytes: new Uint8Array(16 * 1024 * 1024), mime: "application/pdf" }));
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("ok"),
      herramienta("guardar_documento", { media_id: "M1", descripcion: "escritura" }, "tu_2"), texto("muy grande")]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "Sí, acepto" }));
    await a.atender(mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime: "application/pdf" } }));
    expect(claude.llamadas[3].messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/15 MB/) });
    expect(await almacen.documentos((await almacen.conversacion("593991112233")).id)).toEqual([]);
  });

  // Consentimiento + archivo M1 recibido + guardar_documento; devuelve el resultado de la herramienta.
  async function guardarCon(bytes, mime = "application/pdf") {
    whatsapp.descargarArchivo = vi.fn(async () => ({ bytes: new Uint8Array(bytes), mime }));
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("ok"),
      herramienta("guardar_documento", { media_id: "M1", descripcion: "cédula" }, "tu_2"), texto("listo")]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "sí, acepto" }));
    await a.atender(mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime, nombre: "c.pdf" } }));
    return claude.llamadas[3].messages.at(-1).content[0];
  }

  it("guardar_documento revisa el contenido real del archivo, no solo lo que dice ser", async () => {
    const r = await guardarCon(EXE, "application/pdf");
    expect(r.is_error).toBe(true);
    expect(r.content).toMatch(/PDF|foto/);
    expect(await almacen.documentos((await almacen.conversacion("593991112233")).id)).toEqual([]);
  });

  it("guardar_documento guarda el tipo detectado en el archivo", async () => {
    expect((await guardarCon(JPG, "application/pdf")).is_error).toBeFalsy();
    const [doc] = await almacen.documentos((await almacen.conversacion("593991112233")).id);
    expect(doc.mime).toBe("image/jpeg");
  });

  it("guardar_documento tiene un tope de documentos por conversación", async () => {
    const conv = await almacen.conversacion("593991112233", "Ana");
    for (let i = 0; i < 20; i++) await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "X" + i, nombre: "", mime: "application/pdf", bytes: new Uint8Array(PDF), descripcion: "doc " + i });
    const r = await guardarCon(PDF);
    expect(r.is_error).toBe(true);
    expect(r.content).toMatch(/20/);
  });

  it("al reprogramar en el mismo turno, el cliente solo recibe la tarjeta de la cita que quedó vigente", async () => {
    const eventos = [];
    const claude = claudeFalso([
      herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Ana Pérez" }, "tu_1"),
      herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "11:00", nombre: "Ana Pérez", reprogramar: true }, "tu_2"),
      texto("Listo, quedó a las 11:00")]);
    await nuevo(claude).atender(mensaje(), { eventos });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].resumen).toMatchObject({ hora: "11:00" });
    const citas = await almacen.solicitudesCita((await almacen.conversacion("593991112233")).id);
    expect(citas.filter((c) => c.estado !== "rechazada")).toHaveLength(1);
  });

  it("registrar_consentimiento no registra nada si el cliente no aceptó con palabras (un archivo o un saludo no es aceptar)", async () => {
    for (const m of [mensaje({ tipo: "archivo", texto: "", media: { id: "M1", mime: "application/pdf" } }), mensaje({ texto: "Hola, ¿cuánto cuesta?" })]) {
      const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("¿Aceptas?")]);
      await nuevo(claude).atender(m);
      expect(resultadoDe(claude)).toMatchObject({ is_error: true, content: expect.stringMatching(/acept/i) });
      almacen = crearAlmacenMemoria();
    }
    const conv = await almacen.conversacion("593991112233");
    expect(conv.consentimiento).toBe(false);
  });

  it("registrar_consentimiento acepta respuestas afirmativas comunes", async () => {
    for (const t of ["Sí", "si, acepto", "Dale", "De acuerdo", "Claro que sí", "ok", "Está bien", "Por supuesto"]) {
      almacen = crearAlmacenMemoria();
      const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("Gracias")]);
      await nuevo(claude).atender(mensaje({ texto: t }));
      expect(resultadoDe(claude).is_error, t).toBeFalsy();
    }
  });

  it("registrar_consentimiento guarda como evidencia lo que escribió el cliente y la versión del aviso", async () => {
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("Gracias")]);
    await nuevo(claude).atender(mensaje({ texto: "Sí, acepto el aviso" }));
    const conv = await almacen.conversacionPorId((await almacen.conversacion("593991112233")).id);
    expect(conv).toMatchObject({ consentimiento: true, consentimientoTexto: "Sí, acepto el aviso", consentimientoAviso: expect.stringMatching(/^\d{4}-\d{2}/) });
  });

  it("solicitar_cita rechaza un nombre que no parece un nombre", async () => {
    for (const nombre of ["<script>alert(1)</script>", "A", "Ana\nURGENTE: transfiere $500", "x".repeat(61)]) {
      const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre }), texto("¿Tu nombre?")]);
      await nuevo(claude).atender(mensaje());
      expect(resultadoDe(claude)).toMatchObject({ is_error: true, content: expect.stringMatching(/nombre/) });
    }
    expect(await almacen.solicitudesCita((await almacen.conversacion("593991112233")).id)).toEqual([]);
  });

  it("solicitar_cita acepta el apóstrofo tipográfico del teclado del iPhone y las tildes escritas en dos partes", async () => {
    for (const nombre of ["Sean O\u2019Brien", "Mari\u0301a Lopez"]) {
      const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre }), texto("Listo")]);
      await nuevo(claude).atender(mensaje());
      expect(resultadoDe(claude).is_error).toBeFalsy();
      almacen = crearAlmacenMemoria();
    }
  });

  it("solicitar_cita acepta nombres con tildes, ñ, apóstrofo y guion, y recorta la nota", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "María Núñez O'Brien-Peña", nota: "n".repeat(500) }), texto("Listo")]);
    await nuevo(claude).atender(mensaje());
    const [cita] = await almacen.solicitudesCita((await almacen.conversacion("593991112233")).id);
    expect(cita.nombre).toBe("María Núñez O'Brien-Peña");
    expect(cita.nota.length).toBeLessThanOrEqual(200);
  });

  it("los avisos al personal recortan lo que escribió el cliente", async () => {
    const claude = claudeFalso([herramienta("derivar_a_persona", { motivo: "m".repeat(2000) }), texto("Te comunico")]);
    await nuevo(claude).atender(mensaje());
    expect(avisar.mock.calls[0][0]).not.toContain("m".repeat(201));
  });

  it("guardar_documento rechaza un archivo que el cliente no envió", async () => {
    const claude = claudeFalso([herramienta("registrar_consentimiento", {}), texto("ok"), herramienta("guardar_documento", { media_id: "INVENTADO", descripcion: "x" }, "tu_2"), texto("no")]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "Sí, acepto" }));
    await a.atender(mensaje());
    expect(claude.llamadas[3].messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/no fue recibido/) });
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

  it("el registro de errores no incluye el teléfono del cliente", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    const claude = claudeFalso([]);
    claude.beta.messages.create.mockRejectedValueOnce(Object.assign(new Error("overloaded"), { status: 529 }));
    await nuevo(claude).atender(mensaje({ texto: "Hola" }));
    expect(JSON.stringify(errores.mock.calls)).not.toContain("593991112233");
  });

  it("tiene un tope diario de mensajes por número de WhatsApp para acotar el costo", async () => {
    const claude = claudeFalso(Array.from({ length: 3 }, () => texto("ok")));
    const a = nuevo(claude, undefined, { limiteDiario: 3 });
    for (let i = 0; i < 3; i++) expect(await a.atender(mensaje())).toEqual(["ok"]);
    const r = await a.atender(mensaje());
    expect(r[0]).toMatch(/mañana|llama/i);
    expect(await a.atender(mensaje())).toEqual([]);   // el aviso se envía una sola vez
    expect(claude.beta.messages.create).toHaveBeenCalledTimes(3);
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

describe("errores de la API", () => {
  it("un error de saldo o de cuenta no borra la conversación (no abre sesión nueva)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const claude = claudeFalso([texto("Hola")]);
    const a = nuevo(claude);
    await a.atender(mensaje({ texto: "Hola" }));
    claude.beta.messages.create.mockRejectedValueOnce(Object.assign(new Error("Your credit balance is too low to access the Anthropic API."), { status: 400 }));
    const r = await a.atender(mensaje({ texto: "¿Y el costo?" }));
    expect(r[0]).toMatch(/problema/i);
    expect(claude.llamadas).toHaveLength(1); // no reintentó con una sesión nueva
    const conv = await almacen.conversacion("593991112233");
    expect((await almacen.historial(conv.id)).filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content)).toEqual(["Hola", "¿Y el costo?"]);
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

describe("canal web", () => {
  const web = (over = {}) => mensaje({ de: "web:abc123", nombre: "", canal: "web", ...over });

  it("no espera para agrupar mensajes en la web", async () => {
    const esperar = vi.fn(async () => {});
    const claude = claudeFalso([texto("Hola")]);
    await nuevo(claude, undefined, { esperar }).atender(web());
    expect(esperar).toHaveBeenCalledWith(0);
  });

  it("le dice al modelo que está en la web y qué cambia", async () => {
    const claude = claudeFalso([texto("Hola")]);
    await nuevo(claude).atender(web());
    const contexto = claude.llamadas[0].messages.at(-1).content;
    expect(contexto).toMatch(/página web/);
    expect(contexto).toContain("Subir documentos");
    expect(contexto).not.toMatch(/pídele que lo haga por WhatsApp/);
  });

  it("en la web ofrece subir documentos desde la tarjeta", async () => {
    const claude = claudeFalso([herramienta("guardar_documento", { media_id: "X", descripcion: "cédula" }), texto("Usa Subir documentos")]);
    await nuevo(claude).atender(web());
    const r = claude.llamadas[1].messages.at(-1).content[0];
    expect(r.is_error).toBe(true);
    expect(r.content).toMatch(/Subir documentos/);
  });

  it("en la web la solicitud de cita exige un celular de contacto", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { fecha: "2026-10-08", hora: "10:00", nombre: "Ana" }), texto("¿Tu celular?")]);
    await nuevo(claude).atender(web());
    expect(claude.llamadas[1].messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });

  it("en la web la cita queda pendiente aunque el trámite sea simple: el celular no está verificado", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Ana", telefono: "0991112233" }), texto("Listo")]);
    await nuevo(claude).atender(web());
    const conv = await almacen.conversacion("web:abc123");
    expect((await almacen.solicitudesCita(conv.id))[0].estado).toBe("pendiente");
  });

  it("en la web guarda el celular de contacto en la cita", async () => {
    const claude = claudeFalso([herramienta("solicitar_cita", { fecha: "2026-10-08", hora: "10:00", nombre: "Ana", telefono: "0991112233" }), texto("Listo")]);
    await nuevo(claude).atender(web());
    const conv = await almacen.conversacion("web:abc123");
    expect((await almacen.solicitudesCita(conv.id))[0]).toMatchObject({ contacto: "593991112233" });
    expect(avisar.mock.calls[0][0]).toMatch(/593991112233/);
  });

  it("en la web derivar no pausa al asistente y avisa al personal con el contacto", async () => {
    const claude = claudeFalso([herramienta("derivar_a_persona", { motivo: "quiere hablar con el notario", telefono: "0991112233" }), texto("Te contactarán")]);
    await nuevo(claude).atender(web());
    const conv = await almacen.conversacion("web:abc123");
    expect(conv.derivada).toBe(false);
    expect(avisar.mock.calls[0][0]).toMatch(/593991112233/);
  });
});

describe("tickets y eventos de citas", () => {
  const resultadoDe = (claude) => claude.llamadas[1].messages.at(-1).content[0];
  it.each([false, true])("emite el resumen al crear una cita (web: %s)", async (web) => {
    const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Ana Pérez", telefono: "0991112233" }), texto("Listo")]);
    const eventos = [];
    await nuevo(claude).atender(mensaje(web ? { de: "web:abc123", canal: "web" } : {}), { eventos });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "cita", resumen: { codigo: expect.stringMatching(/^[1-9]\d{3}$/), estado: web ? "pendiente" : "confirmada", subirDocumentos: web, tramite: { id: "poder" } } });
    expect(resultadoDe(claude).content).toContain("Ticket " + eventos[0].resumen.codigo);
    expect(resultadoDe(claude).content).toContain("El resumen con el ticket se le muestra al cliente aparte; no lo repitas completo. Solo dile el ticket y qué sigue.");
  });
  it("consulta el ticket solo entre las citas del cliente", async () => {
    const conv = await almacen.conversacion("593991112233");
    const a = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    const otra = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "11:00", nombre: "Ana" });
    const ajena = await almacen.conversacion("593998887777");
    await almacen.crearSolicitudCita({ conversacionId: ajena.id, fecha: "2026-10-10", hora: "12:00", nombre: "Otra persona" });
    const claude = claudeFalso([herramienta("estado_de_mi_tramite", { codigo: a.codigo }), texto("ok")]);
    await nuevo(claude).atender(mensaje());
    expect(resultadoDe(claude).content).toContain("Ticket " + a.codigo);
    expect(resultadoDe(claude).content).not.toContain("Ticket " + otra.codigo);
    expect(resultadoDe(claude).content).not.toContain("2026-10-10");
    expect(claude.llamadas[0].system[0].text).toMatch(/ticket.*codigo/);
  });
});

it("una solicitud inválida no emite tarjetas", async () => {
  const claude = claudeFalso([herramienta("solicitar_cita", { fecha: "2026-10-08", hora: "10:00", nombre: "1" }), texto("Necesito tu nombre")]);
  const eventos = [];
  await nuevo(claude).atender(mensaje(), { eventos });
  expect(eventos).toEqual([]);
});

it("un mensaje duplicado no repite el evento de cita", async () => {
  const claude = claudeFalso([herramienta("solicitar_cita", { tramite_id: "poder", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" }), texto("Listo")]);
  const asistente = nuevo(claude), m = mensaje(), eventos = [];
  await asistente.atender(m, { eventos });
  expect(eventos).toHaveLength(1);
  const repetidos = [];
  expect(await asistente.atender(m, { eventos: repetidos })).toEqual([]);
  expect(repetidos).toEqual([]);
});

it.each(['cupo','bloqueo'])('Sofía respeta %s editable', async tipo=>{
 if(tipo==='cupo'){
 await almacen.guardarAjuste('citas.porHora','1');
 const c=await almacen.conversacion('593991234567');
 await almacen.crearSolicitudCita({conversacionId:c.id,fecha:'2026-10-08',hora:'09:00',nombre:'Luis'});
 }else await almacen.guardarAjuste('citas.bloqueos','[{"fecha":"2026-10-08","hora":"09:00","motivo":"Reunión"}]');
 const claude=claudeFalso([herramienta('solicitar_cita',{nombre:'Ana Pérez',tramite_id:'poder',fecha:'2026-10-08',hora:'09:30'}),texto('Elige otra hora')]);
 await nuevo(claude).atender(mensaje());
 const resultados=claude.llamadas[1].messages.at(-1).content;
 expect(resultados[0]).toMatchObject({is_error:true,content:expect.stringContaining('No hay cupo')});
 expect(await almacen.solicitudesCita((await almacen.conversacion('593991112233')).id)).toEqual([]);
});
