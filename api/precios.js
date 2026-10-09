// Precios públicos: únicamente los valores editados en el panel.
import { obtenerServicios } from "./_lib/servicios.js";
export function crearManejadorPrecios({ almacen }) {
  return async () => {
    try {
      const [filas, ajustes] = await Promise.all([almacen.precios(), almacen.ajustes()]);
      const precios = Object.fromEntries(filas.map(({ tramiteId, tipo, valor, unidad, tabla }) => [tramiteId, { tipo, valor, unidad, tabla }]));
      return Response.json({ precios, ...ajustes }, { headers: { "Cache-Control": "public, s-maxage=60" } });
    } catch { return Response.json({ error: "No se pudieron cargar los precios." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  };
}
export const GET = (request) => crearManejadorPrecios(obtenerServicios())(request);
