// Almacén del portal de clientes en memoria (pruebas y desarrollo). Misma interfaz que portal-supabase.js.
// Se integra en almacen-memoria.js, que le pasa acceso a sus citas y documentos.
import { exigirNotaria } from "./notaria.js";

const CAMPOS_CLIENTE = ["nombres", "apellidos", "celular", "avisosCorreo", "avisosWhatsapp", "privacidadVersion", "terminosVersion",
  "privacidadAceptadaEn", "ultimoAcceso", "estado"];
const MAX_INTENTOS = 5, DIA = 864e5;

export function crearPortalMemoria({ citas, documentos, nuevoId }) {
  let clientes = [], codigos = [], sesiones = [], vinculos = [], eventos = [], pagos = [], pagoEventos = [];
  const copia = (x) => structuredClone(x);
  const iso = (ms = Date.now()) => new Date(ms).toISOString();
  const vigente = (fechaIso, ahora) => Date.parse(fechaIso) > ahora;
  const docPublico = (d) => ({ descripcion: d.descripcion || "", nombre: d.nombre || "", estado: d.estado || "recibido",
    observacion: d.observacionCliente || "", creado: d.creado });
  const pagoPublico = (p) => ({ id: p.id, estado: p.estado, concepto: p.concepto, montoCentavos: p.montoCentavos, moneda: p.moneda, pagadoEn: p.pagadoEn || null });
  const resumenTramite = (c) => ({
    ...copia(c),
    documentos: documentos().filter((d) => !d.borradoEn && (d.solicitudId === c.id || (!d.solicitudId && d.conversacionId === c.conversacionId))).map(docPublico),
    pagos: pagos.filter((p) => p.solicitudId === c.id).map(pagoPublico)
  });
  const propia = (notariaId, clienteId, id) => citas().find((c) => c.id === id && (c.notariaId || "notaria41") === notariaId && c.clienteId === clienteId);

  return {
    // --- Códigos de un solo uso ---
    async crearCodigoCliente({ notariaId, destinoHuella, codigoHmac, expiraEn, ipHuella = "" }) {
      exigirNotaria(notariaId);
      const ahora = iso();
      for (const c of codigos) if (c.notariaId === notariaId && c.destinoHuella === destinoHuella && !c.usadoEn) c.usadoEn = ahora;
      const c = { id: nuevoId(), notariaId, destinoHuella, codigoHmac, intentos: 0, expiraEn, usadoEn: null, ipHuella, creado: ahora };
      codigos.push(c);
      return { id: c.id };
    },
    async ultimoCodigoCliente({ notariaId, destinoHuella }) {
      exigirNotaria(notariaId);
      const c = codigos.filter((x) => x.notariaId === notariaId && x.destinoHuella === destinoHuella).at(-1);
      return c ? { creado: c.creado } : null;
    },
    async consumirCodigoCliente({ notariaId, destinoHuella, codigoHmac, ahora = Date.now() }) {
      exigirNotaria(notariaId);
      const c = codigos.filter((x) => x.notariaId === notariaId && x.destinoHuella === destinoHuella && !x.usadoEn && vigente(x.expiraEn, ahora) && x.intentos < MAX_INTENTOS).at(-1);
      if (!c) return false;
      if (c.codigoHmac === codigoHmac) { c.usadoEn = iso(ahora); return true; }
      c.intentos += 1;
      if (c.intentos >= MAX_INTENTOS) c.usadoEn = iso(ahora);
      return false;
    },

    // --- Clientes ---
    async clientePorEmail(notariaId, email) {
      exigirNotaria(notariaId);
      return copia(clientes.find((c) => c.notariaId === notariaId && c.email === String(email).toLowerCase()) || null);
    },
    async clientePorId(notariaId, id) {
      exigirNotaria(notariaId);
      return copia(clientes.find((c) => c.notariaId === notariaId && c.id === id) || null);
    },
    async crearCliente({ notariaId, email, emailVerificadoEn }) {
      exigirNotaria(notariaId);
      const correo = String(email).toLowerCase();
      if (clientes.some((c) => c.notariaId === notariaId && c.email === correo)) throw Object.assign(new Error("Duplicado"), { code: "23505" });
      const c = { id: crypto.randomUUID(), notariaId, email: correo, emailVerificadoEn, nombres: "", apellidos: "", celular: null,
        avisosCorreo: true, avisosWhatsapp: false, privacidadVersion: "", terminosVersion: "", privacidadAceptadaEn: null,
        estado: "activa", creado: iso(), ultimoAcceso: iso() };
      clientes.push(c);
      return copia(c);
    },
    async actualizarCliente(notariaId, id, cambios) {
      exigirNotaria(notariaId);
      const c = clientes.find((x) => x.notariaId === notariaId && x.id === id);
      if (!c) return;
      for (const k of CAMPOS_CLIENTE) if (k in cambios) c[k] = cambios[k];
    },

    // --- Sesiones (se guarda solo la huella del token) ---
    async crearSesionCliente({ notariaId, clienteId, tokenHash, expiraEn }) {
      exigirNotaria(notariaId);
      const s = { id: nuevoId(), notariaId, clienteId, tokenHash, creada: iso(), ultimaActividad: iso(), expiraEn, revocadaEn: null };
      sesiones.push(s);
      return { id: s.id };
    },
    async sesionCliente(tokenHash) { return copia(sesiones.find((s) => s.tokenHash === tokenHash) || null); },
    async tocarSesionCliente(id, cuando = iso()) { const s = sesiones.find((x) => x.id === id); if (s) s.ultimaActividad = cuando; },
    async revocarSesionCliente(tokenHash) { const s = sesiones.find((x) => x.tokenHash === tokenHash); if (s && !s.revocadaEn) s.revocadaEn = iso(); },
    async revocarSesionesCliente(notariaId, clienteId) {
      exigirNotaria(notariaId);
      for (const s of sesiones) if (s.notariaId === notariaId && s.clienteId === clienteId && !s.revocadaEn) s.revocadaEn = iso();
    },

    // --- Vinculación de trámites ---
    async crearVinculacion({ notariaId, solicitudId, tokenHash, canal, expiraEn, creadoPor = "sistema" }) {
      exigirNotaria(notariaId);
      vinculos.push({ id: nuevoId(), notariaId, solicitudId, tokenHash, canal, expiraEn, usadoEn: null, usadoPor: null, creadoPor, creado: iso() });
    },
    async consumirVinculacion({ notariaId, tokenHash, clienteId, ahora = Date.now() }) {
      exigirNotaria(notariaId);
      const v = vinculos.find((x) => x.notariaId === notariaId && x.tokenHash === tokenHash && !x.usadoEn && vigente(x.expiraEn, ahora));
      if (!v) return null;
      Object.assign(v, { usadoEn: iso(ahora), usadoPor: clienteId });
      const c = citas().find((x) => x.id === v.solicitudId && (x.notariaId || "notaria41") === notariaId);
      if (!c || (c.clienteId && c.clienteId !== clienteId)) return null;
      c.clienteId = clienteId;
      return c.id;
    },
    async desvincularTramite(notariaId, solicitudId) {
      exigirNotaria(notariaId);
      const c = citas().find((x) => x.id === solicitudId && (x.notariaId || "notaria41") === notariaId);
      if (c) c.clienteId = null;
    },

    // --- Trámites del cliente (nunca expone la nota interna ni ids de documentos) ---
    async tramitesDeCliente(notariaId, clienteId) {
      exigirNotaria(notariaId);
      return citas().filter((c) => (c.notariaId || "notaria41") === notariaId && c.clienteId === clienteId).map(resumenTramite);
    },
    async tramiteDeCliente(notariaId, clienteId, id) {
      exigirNotaria(notariaId);
      const c = propia(notariaId, clienteId, id);
      if (!c) return null;
      return { ...resumenTramite(c), eventos: eventos.filter((e) => e.solicitudId === c.id && e.visibleCliente).map(({ tipo, textoCliente, actor, creado }) => ({ tipo, texto: textoCliente, actor, creado })) };
    },
    async registrarEventoTramite({ notariaId, solicitudId, tipo, visibleCliente = true, textoCliente = "", actor = "sistema" }) {
      exigirNotaria(notariaId);
      eventos.push({ id: nuevoId(), notariaId, solicitudId, tipo, visibleCliente, textoCliente, actor, creado: iso() });
    },

    // --- Panel ---
    async clientesPanel(notariaId, { ticket, texto, email } = {}) {
      exigirNotaria(notariaId);
      let lista = clientes.filter((c) => c.notariaId === notariaId);
      if (email) lista = lista.filter((c) => c.email === String(email).toLowerCase());
      else if (texto) { const t = String(texto).toLowerCase(); lista = lista.filter((c) => (c.nombres + " " + c.apellidos).toLowerCase().includes(t)); }
      else if (ticket) { const ids = new Set(citas().filter((x) => (x.notariaId || "notaria41") === notariaId && x.codigo === ticket && x.clienteId).map((x) => x.clienteId)); lista = lista.filter((c) => ids.has(c.id)); }
      else return [];
      return lista.slice(0, 50).map((c) => ({ id: c.id, email: c.email, nombres: c.nombres, apellidos: c.apellidos, estado: c.estado, creado: c.creado,
        ultimoAcceso: c.ultimoAcceso, tramites: citas().filter((x) => x.clienteId === c.id).length }));
    },

    // --- Pagos del ciudadano (caso A) ---
    async crearPago(p) {
      exigirNotaria(p.notariaId);
      const previo = pagos.find((x) => x.idempotencia === p.idempotencia);
      if (previo) return { ...copia(previo), existente: true };
      const pago = { id: crypto.randomUUID(), solicitudId: null, clienteId: null, ticketSnapshot: "", moneda: "USD", estado: "creado",
        ordenProveedor: null, pagadoEn: null, ...copia(p), creado: iso(), actualizado: iso() };
      pagos.push(pago);
      return copia(pago);
    },
    async pagoPorId(notariaId, id) { exigirNotaria(notariaId); return copia(pagos.find((p) => p.notariaId === notariaId && p.id === id) || null); },
    async pagoPorOrden(proveedor, orden) { return copia(pagos.find((p) => p.proveedor === proveedor && p.ordenProveedor === orden) || null); },
    async fijarOrdenPago(id, orden) {
      const p = pagos.find((x) => x.id === id);
      if (pagos.some((x) => x !== p && x.proveedor === p?.proveedor && x.ordenProveedor === orden)) throw Object.assign(new Error("Duplicado"), { code: "23505" });
      if (p) Object.assign(p, { ordenProveedor: orden, actualizado: iso() });
    },
    // Cambio de estado condicionado al estado actual: dos webhooks simultáneos no aplican la misma transición dos veces.
    async transicionarPago(id, de, a, { pagadoEn = null } = {}) {
      const p = pagos.find((x) => x.id === id && x.estado === de);
      if (!p) return false;
      Object.assign(p, { estado: a, actualizado: iso(), ...(pagadoEn ? { pagadoEn } : {}) });
      return true;
    },
    async registrarEventoPago(e) {
      if (pagoEventos.some((x) => x.proveedor === e.proveedor && x.eventoProveedorId === e.eventoProveedorId)) return { duplicado: true };
      pagoEventos.push({ id: nuevoId(), ...copia(e), creado: iso() });
      return { duplicado: false };
    },
    async pagoEventos() { return copia(pagoEventos); },

    // --- Retención ---
    async purgarPortal({ ahora = Date.now() } = {}) {
      const ids = new Set(citas().map((c) => c.id));
      codigos = codigos.filter((c) => Date.parse(c.creado) > ahora - DIA);
      sesiones = sesiones.filter((s) => !(s.revocadaEn || Date.parse(s.expiraEn) < ahora) || Date.parse(s.revocadaEn || s.expiraEn) > ahora - 30 * DIA);
      vinculos = vinculos.filter((v) => ids.has(v.solicitudId) && !((v.usadoEn || Date.parse(v.expiraEn) < ahora) && Date.parse(v.usadoEn || v.expiraEn) < ahora - 30 * DIA));
      eventos = eventos.filter((e) => ids.has(e.solicitudId));
      const inactivos = new Set(clientes.filter((c) => Date.parse(c.ultimoAcceso) < ahora - 730 * DIA).map((c) => c.id));
      clientes = clientes.filter((c) => !inactivos.has(c.id));
      sesiones = sesiones.filter((s) => !inactivos.has(s.clienteId));
      for (const c of citas()) if (inactivos.has(c.clienteId)) c.clienteId = null;
      for (const p of pagos) { if (!ids.has(p.solicitudId)) p.solicitudId = null; if (inactivos.has(p.clienteId)) p.clienteId = null; }
      return { clientes: inactivos.size };
    }
  };
}
