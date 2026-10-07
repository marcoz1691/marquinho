// API del panel del personal: https://<dominio>/api/panel
import { crearManejadorPanel } from "./_lib/panel-http.js";
import { obtenerServicios } from "./_lib/servicios.js";

const manejador = () => {
  const { panel, almacen, env } = obtenerServicios();
  // La verificación en dos pasos es obligatoria salvo que se desactive a propósito (PANEL_MFA=desactivada).
  return crearManejadorPanel({ panel, auth: almacen, exigirMfa: env.PANEL_MFA !== "desactivada" });
};

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
