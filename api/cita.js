import { crearManejadorCita } from "./_lib/cita-http.js";
import { obtenerServicios } from "./_lib/servicios.js";
const dependencias = () => {
  const { almacen, contenido, avisar } = obtenerServicios();
  return { almacen, contenido, avisar };
};
export const GET = (request) => crearManejadorCita(dependencias()).GET(request);
export const POST = (request) => crearManejadorCita(dependencias()).POST(request);
