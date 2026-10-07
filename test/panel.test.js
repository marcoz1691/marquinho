import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearPanel } from "../api/_lib/panel.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { Aviso } from "../api/_lib/errores.js";

const contenido = async () => ({
  data: { categorias: [], tramites: [{ id: "compraventa", cat: "x", nombre: "Compraventa de inmuebles", desc: "", req: [], pasos: [], tarifa: { tipo: "consultar" } }], faq: [], avisos: [] },
  tarifas: { sbu: 482, iva: 0.15, tablas: {} },
  notaria: { nombre: "Notaría 41 de Quito", direccion: "Simón Bolívar Oe1-222, Tumbaco", horario: { dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "17:00", texto: "" } }
});

let almacen, whatsapp, panel, conv, t;
beforeEach(async () => {
  almacen = crearAlmacenMemoria();
  whatsapp = { enviarTexto: vi.fn(async () => ({})), enviarPlantilla: vi.fn(async () => ({})) };
  t = new Date("2026-10-06T15:00:00Z");
  panel = crearPanel({ almacen, whatsapp, contenido, ahora: () => t, esperar: async () => {},
    plantillas: { citaConfirmada: "cita_confirmada", citaRechazada: "cita_rechazada" } });
  conv = await almacen.conversacion("593991112233", "Ana");
  const s = await almacen.sesionActiva(conv.id, { ahora: t.getTime(), sistema: "S", inactividadMs: 864e5 });
  await almacen.agregarMensajes(s.id, [{ role: "user", content: "Quiero hablar con alguien" }], t.getTime());
  await almacen.marcarClienteEscribio(conv.id, t.getTime());
});

describe("panel del personal", () => {
  it("lista las conversaciones con su último mensaje, derivación y citas pendientes", async () => {
    await almacen.actualizarConversacion(conv.id, { derivada: true });
    await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    const [c] = await panel.conversaciones();
    expect(c).toMatchObject({ id: conv.id, nombre: "Ana", derivada: true, citasPendientes: 1, ultimo: "Quiero hablar con alguien" });
  });

  it("responder envía el texto por WhatsApp y lo agrega a la conversación", async () => {
    await panel.responder(conv.id, "Hola Ana, soy Carla de la notaría.");
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith("593991112233", "Hola Ana, soy Carla de la notaría.");
    const h = await almacen.historial(conv.id);
    expect(h.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "[Personal de la notaría] Hola Ana, soy Carla de la notaría." }] });
  });

  it("responder no se permite después de 24 horas del último mensaje del cliente (regla de WhatsApp)", async () => {
    t = new Date("2026-10-07T16:00:00Z");
    await expect(panel.responder(conv.id, "Hola")).rejects.toThrow(/24 horas/);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it("devolver al asistente quita la derivación", async () => {
    await almacen.actualizarConversacion(conv.id, { derivada: true });
    await panel.devolverAlAsistente(conv.id);
    expect((await almacen.conversacion("593991112233")).derivada).toBe(false);
  });

  it("confirmar una cita cambia su estado y avisa al cliente con día, hora y trámite", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    await panel.decidirCita(id, "confirmada");
    expect((await almacen.solicitudesCita(conv.id))[0].estado).toBe("confirmada");
    const msg = whatsapp.enviarTexto.mock.calls[0][1];
    expect(msg).toMatch(/confirmada/);
    expect(msg).toMatch(/Compraventa/);
    expect(msg).toMatch(/10:00/);
  });

  it("rechazar una cita avisa al cliente para elegir otro horario", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: null, fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    await panel.decidirCita(id, "rechazada", "Ese día el notario no atiende");
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/otro horario/);
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/no atiende/);
  });

  it("busca tickets activos desde hoy con nombre del trámite y contacto", async () => {
    const { id, codigo } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    expect(await panel.buscarTicket(codigo)).toEqual([expect.objectContaining({ id, codigo, tramite: "Compraventa de inmuebles", telefono: "593991112233", conversacionId: conv.id })]);
    await expect(panel.buscarTicket("123")).rejects.toBeInstanceOf(Aviso);
  });

  it("la agenda del día lista las citas con su trámite, estado y a quién se asignaron", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-08", hora: "10:00", nombre: "Ana", estado: "confirmada" });
    await panel.asignarCita(id, "Rosa");
    const a = await panel.agenda("2026-10-08");
    expect(a.citas).toEqual([expect.objectContaining({ id, tramite: "Compraventa de inmuebles", estado: "confirmada", asignadaA: "Rosa", telefono: "593991112233" })]);
    expect(a.personal).toEqual([]);
  });

  it("la agenda sin fecha muestra la de hoy en Quito", async () => {
    await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-06", hora: "15:00", nombre: "Ana" });
    const a = await panel.agenda();
    expect(a.fecha).toBe("2026-10-06");
    expect(a.citas).toHaveLength(1);
  });

  it("cancelar una cita ya confirmada le explica al cliente que se canceló", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "10:00", nombre: "Ana", estado: "confirmada" });
    await panel.decidirCita(id, "rechazada", "El notario no estará ese día");
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/cancelar tu cita/);
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/no estará/);
  });

  it("no vuelve a decidir una cita cancelada ni repite el mismo estado (evita avisos dobles)", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "10:00", nombre: "Ana", estado: "confirmada" });
    await expect(panel.decidirCita(id, "confirmada")).rejects.toThrow(/ya está/);
    await panel.decidirCita(id, "rechazada");
    await expect(panel.decidirCita(id, "rechazada")).rejects.toThrow();
    await expect(panel.decidirCita(id, "confirmada")).rejects.toThrow();
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
  });

  it("no acepta estados de cita desconocidos", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "10:00", nombre: "Ana" });
    await expect(panel.decidirCita(id, "borrada")).rejects.toThrow();
  });

  it("borrar un documento lo saca del panel y deja registrado quién lo borró", async () => {
    const { id } = await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "M1", nombre: "c.pdf", mime: "application/pdf", bytes: new Uint8Array([1]), descripcion: "cédula" });
    const espia = vi.spyOn(almacen, "borrarDocumento");
    await panel.borrarDocumento(id, "carla@notaria41.ec");
    expect(espia).toHaveBeenCalledWith(id, { por: "carla@notaria41.ec" });
    expect(await almacen.documentos(conv.id)).toEqual([]);
    expect(await almacen.urlDocumento(id)).toBeNull();
  });

  it("si la plantilla no se puede enviar (por ejemplo, por el tope diario), la cita igual queda decidida y avisa que no notificó", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    whatsapp.enviarPlantilla.mockRejectedValueOnce(new Error("Se alcanzó el tope diario"));
    t = new Date("2026-10-09T15:00:00Z");   // más de 24 h después del último mensaje: solo plantilla
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-12", hora: "10:00", nombre: "Ana" });
    expect(await panel.decidirCita(id, "confirmada")).toEqual({ avisado: false });
    expect((await almacen.cita(id)).estado).toBe("confirmada");
  });

  it("los errores de reglas del panel son avisos para el personal", async () => {
    await expect(panel.decidirCita("no-existe", "confirmada")).rejects.toBeInstanceOf(Aviso);
    await expect(panel.responder(conv.id, "")).rejects.toBeInstanceOf(Aviso);
  });

  it("limita el largo de lo que escribe el personal", async () => {
    await expect(panel.responder(conv.id, "a".repeat(2001))).rejects.toThrow(/largo/);
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2026-10-08", hora: "10:00", nombre: "Ana", estado: "confirmada" });
    await expect(panel.asignarCita(id, "x".repeat(61))).rejects.toThrow(/nombre/);
    await panel.decidirCita(id, "rechazada", "m".repeat(500));
    expect(whatsapp.enviarTexto.mock.calls[0][1]).not.toContain("m".repeat(201));
  });

  it("detalle muestra la conversación legible sin bloques internos", async () => {
    const s = await almacen.sesionActiva(conv.id, { ahora: t.getTime(), sistema: "S", inactividadMs: 864e5 });
    await almacen.agregarMensajes(s.id, [
      { role: "system", content: "Fecha..." },
      { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Te comunico con una persona" }, { type: "tool_use", id: "x", name: "derivar_a_persona", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }] }
    ], t.getTime());
    const d = await panel.detalle(conv.id);
    expect(d.mensajes).toEqual([
      { autor: "cliente", texto: "Quiero hablar con alguien" },
      { autor: "asistente", texto: "Te comunico con una persona" }
    ]);
  });

  it("la lista no carga el historial completo de cada conversación", async () => {
    const espia = vi.spyOn(almacen, "historial");
    await panel.conversaciones();
    expect(espia).not.toHaveBeenCalled();
  });

  it("responder espera el turno del asistente y falla con un mensaje claro si no se libera", async () => {
    await almacen.tomarTurno(conv.id, t.getTime(), 60000);
    await expect(panel.responder(conv.id, "Hola")).rejects.toThrow(/asistente está respondiendo/);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it("responder libera el turno al terminar", async () => {
    await panel.responder(conv.id, "Hola");
    expect(await almacen.tomarTurno(conv.id, t.getTime(), 1000)).toBe(true);
  });

  it("confirmar una cita fuera de la ventana de 24 h avisa con la plantilla aprobada", async () => {
    const { id } = await almacen.crearSolicitudCita({ conversacionId: conv.id, tramiteId: "compraventa", fecha: "2026-10-12", hora: "09:00", nombre: "Ana" });
    t = new Date("2026-10-09T15:00:00Z");
    const r = await panel.decidirCita(id, "confirmada");
    expect(r.avisado).toBe(true);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(whatsapp.enviarPlantilla).toHaveBeenCalledWith("593991112233", "cita_confirmada", ["Ana", "Compraventa de inmuebles", "lunes, 12 de octubre", "09:00"]);
  });

  it("revisar un documento guarda el estado y la observación y avisa al cliente", async () => {
    const { id } = await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "M1", nombre: "c.pdf", mime: "application/pdf", bytes: new Uint8Array([1]), descripcion: "cédula" });
    await panel.revisarDocumento(id, "observado", "La foto está borrosa, envíala de nuevo");
    expect((await almacen.documentos(conv.id))[0]).toMatchObject({ estado: "observado", nota: "La foto está borrosa, envíala de nuevo" });
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toMatch(/cédula.*borrosa/s);
  });

  it("no acepta estados de documento desconocidos", async () => {
    const { id } = await almacen.guardarDocumento({ conversacionId: conv.id, mediaId: "M1", nombre: "", mime: "", bytes: new Uint8Array([1]), descripcion: "x" });
    await expect(panel.revisarDocumento(id, "perdido")).rejects.toThrow();
  });

  describe("conversaciones del chat web", () => {
    let web;
    beforeEach(async () => {
      web = await almacen.conversacion("web:s_7f3a9c2e41b84d0f");
      const s = await almacen.sesionActiva(web.id, { ahora: t.getTime(), sistema: "S", inactividadMs: 864e5 });
      await almacen.agregarMensajes(s.id, [{ role: "user", content: "Quiero una cita" }], t.getTime());
      await almacen.marcarClienteEscribio(web.id, t.getTime());
    });

    it("se marcan como canal web en la lista y en el detalle no se pueden responder", async () => {
      expect((await panel.conversaciones()).find((c) => c.id === web.id)).toMatchObject({ canal: "web" });
      expect(await panel.detalle(web.id)).toMatchObject({ puedeResponder: false, canal: "web" });
    });

    it("responder a una conversación web explica que no es posible", async () => {
      await expect(panel.responder(web.id, "Hola")).rejects.toThrow(/página web/);
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it("confirmar una cita web avisa por WhatsApp al celular de contacto con la plantilla", async () => {
      const { id } = await almacen.crearSolicitudCita({ conversacionId: web.id, tramiteId: "compraventa", fecha: "2026-10-12", hora: "09:00", nombre: "Ana", contacto: "593991112233" });
      const r = await panel.decidirCita(id, "confirmada");
      expect(r.avisado).toBe(true);
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
      expect(whatsapp.enviarPlantilla).toHaveBeenCalledWith("593991112233", "cita_confirmada", ["Ana", "Compraventa de inmuebles", "lunes, 12 de octubre", "09:00"]);
    });
  });
});

it("valida y guarda precios, restaura y ajusta SBU", async () => {
  await expect(panel.guardarPrecio({ tramiteId: "no", tipo: "fija", valor: 10 }, "admin")).rejects.toBeInstanceOf(Aviso);
  for (const precio of [{ tipo: "no" }, { tipo: "pct", valor: 0 }, { tipo: "fija", valor: Infinity }, { tipo: "fija", valor: "10" }, { tipo: "cuantia", tabla: "no" }, { tipo: "consultar", unidad: "x".repeat(31) }]) {
    await expect(panel.guardarPrecio({ tramiteId: "compraventa", ...precio }, "admin")).rejects.toBeInstanceOf(Aviso);
  }
  await panel.guardarPrecio({ tramiteId: "compraventa", tipo: "pct", valor: 0.12 }, "admin");
  expect((await panel.precios()).tramites[0]).toMatchObject({ editada: true, tarifa: { tipo: "pct", valor: 0.12 }, actualizadoPor: "admin" });
  await panel.restaurarPrecio("compraventa");
  expect((await panel.precios()).tramites[0].editada).toBe(false);
  await expect(panel.guardarSBU({ sbu: 99, anio: "2027" }, "admin")).rejects.toBeInstanceOf(Aviso);
  await expect(panel.guardarSBU({ sbu: 500, anio: "27" }, "admin")).rejects.toBeInstanceOf(Aviso);
  await panel.guardarSBU({ sbu: 500, anio: "2027" }, "admin");
  expect((await panel.precios()).tarifas.sbu).toBe(500);
});

it("rechaza extremos inválidos sin guardar nada y permite los límites válidos", async () => {
  for (const valor of [-1, NaN, 1000.01]) {
    await expect(panel.guardarPrecio({ tramiteId: "compraventa", tipo: "fija", valor }, "admin")).rejects.toBeInstanceOf(Aviso);
  }
  for (const sbu of ["500", NaN, Infinity, 5000.01]) {
    await expect(panel.guardarSBU({ sbu, anio: "2027" }, "admin")).rejects.toBeInstanceOf(Aviso);
  }
  expect(await almacen.precios()).toEqual([]);
  expect(await almacen.ajustes()).toEqual({});
  await panel.guardarPrecio({ tramiteId: "compraventa", tipo: "fija", valor: 1000, unidad: "x".repeat(30) }, "admin");
  await panel.guardarSBU({ sbu: 100, anio: "2027" }, "admin");
  await panel.guardarSBU({ sbu: 5000, anio: "2027" }, "admin");
  expect(await almacen.ajustes()).toEqual({ sbu: 5000, anio: "2027" });
});

it("el año contiene exactamente cuatro dígitos, sin saltos de línea", async () => {
  await expect(panel.guardarSBU({ sbu: 500, anio: "2027\n" }, "admin")).rejects.toBeInstanceOf(Aviso);
});
