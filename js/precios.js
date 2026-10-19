// Aplica solo los valores editados, conservando el contenido oficial de respaldo.
// Se usa en el servidor (Sofía) y en el navegador: un dato dañado o inventado se descarta en vez de dejar precios absurdos.
const TIPOS = ["pct", "fija", "cuantia", "consultar"];

function precioValido(p, tablas) {
  if (!p || typeof p !== "object" || !TIPOS.includes(p.tipo)) return null;
  const valor = Number(p.valor);
  if ((p.tipo === "pct" || p.tipo === "fija") && !(p.valor !== null && Number.isFinite(valor) && valor > 0)) return null;
  if (p.tipo === "cuantia" && !Object.hasOwn(tablas || {}, p.tabla)) return null;
  return { tipo: p.tipo, valor: p.tipo === "pct" || p.tipo === "fija" ? valor : undefined, unidad: String(p.unidad || ""), tabla: String(p.tabla || "") };
}

// Textos de un trámite editados en el panel (nombre, descripción, requisitos, pasos y nota).
// Un texto vacío, demasiado largo o con otra forma se descarta y queda el de la hoja.
const LIMITES_TEXTO = { nombre: 120, desc: 500, nota: 500, item: 300, items: 25 };
const linea = (v, max) => typeof v === "string" && v.trim().length <= max ? v.trim() : null;
const lista = (v) => Array.isArray(v) && v.length <= LIMITES_TEXTO.items && v.every((x) => linea(x, LIMITES_TEXTO.item) !== null)
  ? v.map((x) => x.trim()).filter(Boolean) : null;
export function textoValido(x) {
  if (!x || typeof x !== "object") return null;
  const nombre = linea(x.nombre, LIMITES_TEXTO.nombre), desc = linea(x.desc ?? "", LIMITES_TEXTO.desc), nota = linea(x.nota ?? "", LIMITES_TEXTO.nota);
  const req = lista(x.req ?? []), pasos = lista(x.pasos ?? []);
  if (!nombre || nombre.length < 3 || desc === null || nota === null || !req || !pasos) return null;
  return { nombre, desc, req, pasos, nota };
}
// En la tabla «ajustes» cada trámite editado se guarda como «tramite.<id>» con su texto en JSON.
export function textosDeAjustes(ajustes) {
  const textos = {};
  for (const [clave, valor] of Object.entries(ajustes || {})) {
    if (!clave.startsWith("tramite.")) continue;
    try { textos[clave.slice(8)] = typeof valor === "string" ? JSON.parse(valor) : valor; } catch {}
  }
  return textos;
}

export function aplicarPrecios(contenido, cambios) {
  const precios = cambios?.precios || {};
  const textos = { ...textosDeAjustes(cambios), ...(cambios?.textos || {}) };
  contenido.data.tramites.forEach((t) => {
    // hasOwn: un trámite llamado «constructor» no debe tomar datos del prototipo.
    const p = Object.hasOwn(precios, t.id) ? precioValido(precios[t.id], contenido.tarifas.tablas) : null;
    if (p) t.tarifa = { ...t.tarifa, ...p };
    const texto = Object.hasOwn(textos, t.id) ? textoValido(textos[t.id]) : null;
    if (texto) Object.assign(t, texto);
  });
  const sbu = Number(cambios?.sbu);
  if (cambios?.sbu != null && Number.isFinite(sbu) && sbu > 0) contenido.tarifas.sbu = sbu;
  if (cambios?.anio != null && /^\d{4}$/.test(String(cambios.anio))) contenido.tarifas.anio = String(cambios.anio);
  return contenido;
}
const configuraciones = new WeakMap();
export function configPublica(fetch = globalThis.fetch) {
  if (!configuraciones.has(fetch)) configuraciones.set(fetch, (async () => {
    try { const r = await fetch("/api/precios"); return r.ok ? await r.json() : null; }
    catch { return null; }
  })());
  return configuraciones.get(fetch);
}
export async function cargarFunciones(fetch = globalThis.fetch) {
  const c = await configPublica(fetch);
  // Encendidas salvo que el servidor diga false; portal y pagosEnLinea, apagadas salvo que diga true.
  return { ...Object.fromEntries(["sitio", "chatWeb", "whatsappBot", "agenda", "documentos", "recordatorios"].map(id => [id, c?.funciones?.[id] !== false])),
    ...Object.fromEntries(["portal", "pagosEnLinea"].map(id => [id, c?.funciones?.[id] === true])) };
}
export async function cargarPrecios(contenido, fetch = globalThis.fetch) {
  const c = await configPublica(fetch);
  return c ? aplicarPrecios(structuredClone(contenido), c) : contenido;
}
