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
export async function cargarPrecios(contenido, fetch = globalThis.fetch) {
  try {
    const r = await fetch("/api/precios");
    if (!r.ok) return contenido;
    return aplicarPrecios(structuredClone(contenido), await r.json());
  } catch { return contenido; }
}
