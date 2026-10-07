// Subida y consulta de documentos de una cita desde la página web.
import { crearManejadorDocumentos } from "./_lib/documentos-http.js";
import { obtenerServicios } from "./_lib/servicios.js";

export const POST = (request) => {
  const { almacen, avisar } = obtenerServicios();
  return crearManejadorDocumentos({ almacen, avisar }).POST(request);
};

export const GET = (request) => {
  const { almacen, avisar } = obtenerServicios();
  return crearManejadorDocumentos({ almacen, avisar }).GET(request);
};
