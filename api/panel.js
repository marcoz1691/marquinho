// API del panel del personal: https://<dominio>/api/panel
import { crearManejadorPanel } from "./_lib/panel-http.js";
import { obtenerServicios } from "./_lib/servicios.js";

// Un solo manejador por instancia: recuerda quién ya tiene registrada la verificación en dos pasos.
let instancia = null;
const manejador = () => instancia ||= (() => {
  const { panel, almacen, env, avisar } = obtenerServicios();
  // La verificación en dos pasos es obligatoria salvo que se desactive a propósito (PANEL_MFA=desactivada).
  return crearManejadorPanel({ panel, auth: almacen, exigirMfa: env.PANEL_MFA !== "desactivada", avisar });
})();

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
