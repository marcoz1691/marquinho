// Precios y textos de trámites públicos: únicamente lo editado en el panel.
import { leerFunciones } from "./_lib/funciones.js";
import { textosDeAjustes } from "../js/precios.js";
import { obtenerServicios } from "./_lib/servicios.js";
export function crearManejadorPrecios({ almacen }) {
  return async () => {
    try {
      // Lectura estricta: si falla, mejor 503 que publicar (y cachear) precios con el SBU por defecto.
      const [filas, ajustes] = await Promise.all([almacen.precios(), almacen.ajustes()]);
      const precios = Object.fromEntries(filas.map(({ tramiteId, tipo, valor, unidad, tabla }) => [tramiteId, { tipo, valor, unidad, tabla }]));
      // De los ajustes solo se publican el SBU y el año: los cupos y bloqueos de la agenda (con sus motivos) son internos.
      const publicos = Object.fromEntries(["sbu", "anio"].filter((k) => ajustes[k] !== undefined).map((k) => [k, ajustes[k]]));
      return Response.json({ precios, textos: textosDeAjustes(ajustes), ...publicos, funciones: leerFunciones(ajustes) }, { headers: { "Cache-Control": "public, s-maxage=60" } });
    } catch { return Response.json({ error: "No se pudieron cargar los precios." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  };
}
export const GET = (request) => crearManejadorPrecios(obtenerServicios())(request);
