// Cuenta del cliente y portal «Mis trámites» de Sofía PreFirma.
import { crearManejadorCuenta } from "./_lib/cuenta-http.js";
import { crearCorreo } from "./_lib/correo.js";
import { obtenerServicios } from "./_lib/servicios.js";

let instancia;
const manejador = () => instancia ||= (() => {
  const { almacen, contenido, env } = obtenerServicios();
  return crearManejadorCuenta({ almacen, contenido, correo: crearCorreo(env), secreto: env.CUENTA_SECRETO });
})();

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
