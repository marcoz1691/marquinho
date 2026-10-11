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

export function aplicarPrecios(contenido, cambios) {
  const precios = cambios?.precios || {};
  contenido.data.tramites.forEach((t) => {
    // hasOwn: un trámite llamado «constructor» no debe tomar datos del prototipo.
    const p = Object.hasOwn(precios, t.id) ? precioValido(precios[t.id], contenido.tarifas.tablas) : null;
    if (p) t.tarifa = { ...t.tarifa, ...p };
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
  return Object.fromEntries(["sitio", "chatWeb", "whatsappBot", "agenda", "documentos", "recordatorios"].map(id => [id, c?.funciones?.[id] !== false]));
}
export async function cargarPrecios(contenido, fetch = globalThis.fetch) {
  const c = await configPublica(fetch);
  return c ? aplicarPrecios(structuredClone(contenido), c) : contenido;
}
