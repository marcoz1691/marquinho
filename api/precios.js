// Precios públicos: únicamente los valores editados en el panel.
import { obtenerServicios } from "./_lib/servicios.js";
export function crearManejadorPrecios({ almacen }) {
  return async () => {
    try {
      const [filas, ajustes] = await Promise.all([almacen.precios(), almacen.ajustes()]);
      const precios = Object.fromEntries(filas.map(({ tramiteId, tipo, valor, unidad, tabla }) => [tramiteId, { tipo, valor, unidad, tabla }]));
      // De los ajustes solo se publican el SBU y el año: los cupos y bloqueos de la agenda (con sus motivos) son internos.
      const publicos = Object.fromEntries(["sbu", "anio"].filter((k) => ajustes[k] !== undefined).map((k) => [k, ajustes[k]]));
      return Response.json({ precios, ...publicos }, { headers: { "Cache-Control": "public, s-maxage=60" } });
    } catch { return Response.json({ error: "No se pudieron cargar los precios." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  };
}
export const GET = (request) => crearManejadorPrecios(obtenerServicios())(request);
