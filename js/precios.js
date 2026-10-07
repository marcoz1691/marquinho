// Aplica solo los valores editados, conservando el contenido oficial de respaldo.
export function aplicarPrecios(contenido, cambios) {
  contenido.data.tramites.forEach((t) => {
    const p = cambios.precios?.[t.id];
    if (p) t.tarifa = { ...t.tarifa, tipo: p.tipo, valor: p.valor, unidad: p.unidad || "", tabla: p.tabla || "" };
  });
  if (cambios.sbu !== undefined) contenido.tarifas.sbu = Number(cambios.sbu);
  if (cambios.anio !== undefined) contenido.tarifas.anio = cambios.anio;
  return contenido;
}
export async function cargarPrecios(contenido, fetch = globalThis.fetch) {
  try {
    const r = await fetch("/api/precios");
    if (!r.ok) return contenido;
    return aplicarPrecios(structuredClone(contenido), await r.json());
  } catch { return contenido; }
}
